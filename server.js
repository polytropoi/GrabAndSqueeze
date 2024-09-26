//copyright 2020 servicemedia.net
var express = require("express")
    // , IPFS = require('ipfs-core')
    // , { create, urlSource } = require('ipfs-http-client')
    // , https = require('https')
    // , { create, urlSource } = require('ipfs-http-client')
    // , ipfsHttpClient = create()
    , cors = require('cors')
    , ffmpeg = require('fluent-ffmpeg')
    , ffmpeg_static = require('ffmpeg-static')
    , puppeteer = require('puppeteer')
    , sharp = require('sharp') 
    , http = require("http")
    , jwt = require("jsonwebtoken")
    , path = require("path")
    , http = require("http")
    , fs = require("fs")
    , minio = require('minio')
    , bodyParser = require('body-parser')
    , mongojs = require("mongojs")
    , helmet = require('helmet')
    , ObjectID = require("bson-objectid")
    , nodeCron = require("node-cron")
    app = express();
    app.use(cors());
    app.use(helmet()); //sets a bunch of security headers
    // app.use(helmet.frameguard());
    require('dotenv').config();


var rootHost = process.env.ROOT_HOST;
var appName = "ServiceMedia";
var topName = process.env.ROOT_NAME;
var requirePayment = true; //if subscription is required to login, true for servicemedia

var adminEmail = process.env.ADMIN_EMAIL;

var domainAdminEmail = process.env.DOMAIN_ADMIN_EMAIL;


// var whitelist = ['https://servicemedia.net', 'http://localhost:4000'];

var oneDay = 86400000;

var whitelist = ['https://smxr.net', 'https://servicemedia.net', 'http://localhost:3000']
var corsOptions = {
  origin: function (origin, callback) {
    if (whitelist.indexOf(origin) !== -1 || !origin) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  }
}
    // app.use (function (req, res, next) {
    //     var schema = (req.headers['x-forwarded-proto'] || '').toLowerCase();
    //     if (schema === 'https') {
    //         next();
    //     } else {
            
    //     //    console.log ("non ssl request = " + req.headers.host + " tryna redirect");

    //         if (req.headers.host != "localhost:4000" && req.headers.host != "192.168.1.198:4000") { //TODO Enviromental Varz
    //             let goodURL = 'https://' + req.get('host') + req.originalUrl;
    //             console.log("tryna redirect to " + goodURL)
    //             res.redirect(goodURL);
    //             // var htmltext = "<html xmlns='http://www.w3.org/1999/xhtml'>" +
    //             //     "<head></head><body> " +
    //             //     "you must use https to access this site: <a href='https://servicemedia.net'>https://servicemedia.net</a>" +
    //             //     "</body>";
    //             // res.end(htmltext);
    //         } else {
    //             next();
    //         }
    //     //    next();
    //     }
    // });

var databaseUrl = process.env.MONGO_URL + "?retryWrites=false"; //driver bug ~3.7

var collections = ["acl", "auth_req", "domains", "apps", "assets", "models", "users", "audio_items", "text_items", "audio_item_keys", "image_items", "video_items",
    "obj_items", "paths", "keys", "scores", "attributes","achievements","activity", "purchases", "storeitems", "scenes", "groups", "weblinks"];

var db = mongojs(databaseUrl, collections);


    app.use(express.static(path.join(__dirname, './'), { maxAge: oneDay }));

    app.use(function(req, res, next) {

        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET,POST');
        res.header('Access-Control-Max-Age', '300');
        res.header('Access-Control-Allow-Headers', 'Origin, Access-Control-Allow-Origin, x-unity-version, X-Unity-Version, token, cookie, appid, Cookie, X-Access-Token, x-access-token, X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept');
        res.header('Access-Control-Expose-Headers', 'set-cookie, Set-Cookie', 'token');
        if ('OPTIONS' == req.method) {
            res.send(200);
        } else {
            next();
        }
    });

    // var minioClient = null;
    // if (process.env.MINIOKEY && process.env.MINIOKEY != "" && process.env.MINIOENDPOINT && process.env.MINIOENDPOINT != "") {
    //         minioClient = new minio.Client({
    //         endPoint: process.env.MINIOENDPOINT,
    //         port: 9000,
    //         useSSL: false,
    //         accessKey: process.env.MINIOKEY,
    //         secretKey: process.env.MINIOSECRET
    //     });
    // }

    // app.use(methodOverride());
//    var sessionStore = new session.MemoryStore();
    var expiryDate = new Date(Date.now() + 60 * 60 * 1000) // 2 hour

    app.use(bodyParser.json({ "limit": "10mb", extended: true }));
    app.use(bodyParser.urlencoded({ extended: false }));


var maxItems = 1000;

var aws = require('aws-sdk');
const { lookupService, resolveNaptr, resolveMx, resolve } = require("dns");
const { callbackify } = require("util");
const { tmpdir } = require("os");
const { response } = require("express");
// const { ConfigurationServicePlaceholders } = require("aws-sdk/lib/config_service_placeholders");
// aws.config.loadFromPath('conf.json');
// var ses = new aws.SES({apiVersion : '2010-12-01'});
// var s3 = new aws.S3();

aws.config = new aws.Config({accessKeyId: process.env.AWSKEY, secretAccessKey: process.env.AWSSECRET, region: process.env.AWSREGION});
// var ses = new aws.SES({apiVersion : '2010-12-01'});
var s3 = new aws.S3();

var minioClient = null;
if (process.env.MINIOKEY && process.env.MINIOKEY != "" && process.env.MINIOENDPOINT && process.env.MINIOENDPOINT != "") {
        minioClient = new minio.Client({
        endPoint: process.env.MINIOENDPOINT,
        port: 9000,
        useSSL: false,
        accessKey: process.env.MINIOKEY,
        secretKey: process.env.MINIOSECRET
    });
}




var appAuth = "noauth";

var server = http.createServer(app);
server.timeout = 240000;
server.keepAliveTimeout = 24000;
server.listen(process.env.PORT || 4000, function(){
    console.log("Express server listening on port 4000");
});

let ipfsCore = null;

///////////////////////// OBJECT STORE (S3, Minio, etc) OPS BELOW - TODO - replace all s3 getSignedUrl calls with this, promised based version, to suport minio, etc... (!)
async function ReturnPresignedUrl(bucket, key, time) {
  if (minioClient) {
      return minioClient.presignedGetObject(bucket, key, time);
  } else {
      return s3.getSignedUrl('getObject', {Bucket: bucket, Key: key, Expires: time}); //returns a promise if called in async function?
  } 
}
async function PutObject (targetBucket, key, data, contentType) {
  if (minioClient) {
    try {
      minioClient.putObject(targetBucket, key, data, function(err, objInfo) {
        if(err) {
            console.log("minioerr: " + err) // err should be null
        } else {
            console.log("Success", objInfo)
        }
      }).promise();
    } catch (e) {
      return e;
    }
  } else {
    try {
      s3.putObject({
        Bucket: targetBucket,
        Key: key,
        Body: data,
        ContentType: contentType
      }, function (error, resp) {
          if (error) {
            console.log('error putting  pic' + error);
          } else {
            console.log('Successfully uploaded  pic with response: ' + resp);
          }
      }).promise();
    } catch(e) {
      return e;
    }
  }
}
async function GetObject (targetBucket, key) {
  if (minioClient) {
    try {
      var size = 0
      await minioClient.getObject(targetBucket, key, function(err, dataStream) {
        if (err) {
          return console.log(err)
        }
        dataStream.on('data', function(chunk) {
          size += chunk.length
        })
        dataStream.on('end', function() {
          console.log('End. Total size = ' + size)
          return data
        })
        dataStream.on('error', function(err) {
          console.log(err)
        })
      });
    } catch (e) {
      return e;
    }
  } else {
    try {
      s3.getObject({
      Bucket: targetBucket,
      Key: key,
      }, function (error, resp) {
        if (error) {
          console.log('error getting the obj' + error);
        } else {
          console.log('Successfully gots the obj ' + resp);
          // return resp;
        }
      }).promise();
    } catch (e) {
      return e;
    }
  }
}
async function ReturnObjectMetadata(bucket, key) { //s3.headObject == minio.statObject
  if (minioClient) {
    try {
      minioClient.statObject(bucket, key, function(err, stat) { //statObject = headObject at s3
        if (err) {
            console.log(err);
            return err;
        } else {
            console.log("minio statObject " + stat);
          return stat;
        }
      });
    } catch (e) {
      console.log("caught e: " +e);
      return e;
    }
  } else {
    try {
      var params = {Bucket: bucket, Key: key};
      s3.headObject(params, function (err, data) {
        if (err) {
            console.log("headObject error: " + err);
        } else {
            console.log("staged file meateada " + data);
            return data;
        }
      });
    } catch (e) {
      console.log("caught s3 missing o9bj: "+ e);
      return e
    }
  }
}
async function CopyObject(targetBucket, copySource, key) {
  if (minioClient) {
    minioClient.copyObject(targetBucket, key, copySource, function(e, data) {
      if (e) {
          return e;
      } else {
          console.log("Successfully copied the object:");
          console.log("etag = " + data.etag + ", lastModified = " + data.lastModified);
          return data;
      }
      
    });
  } else {
      s3.copyObject({Bucket: targetBucket, CopySource: copySource, Key: key}, function (err,data){
          if (err) {
              console.log("ERROR copyObject" + err);
              return err;
          } else {
              console.log("SUCCESS copyObject key " + key );
              return data;
          }
      });
  }
} 
/////////////////////////////


function requiredAuthentication(req, res, next) { //used as argument in routes below
  console.log("headers: " + JSON.stringify(req.headers));
    // if (requirePayment) { 
    //     if (req.session.user.paymentStatus == "ok") {
    //         next();
    //     } else {
    //         res.send('payment status not OK');       
    //     }
    // }
    // if (req.session.user && req.session.user.status == "validated") { //check using session cookie
    //     if (requirePayment) { 
    //         if (req.session.user.paymentStatus == "ok") {
    //             next();
    //         } else {
    //             req.session.error = 'Access denied! - payment status not ok';
    //             res.send('payment status not OK');       
    //         }
    //     } else {
    //         console.log("authenticated!");
    //         next();
    //     }
    // } else {
      if (req.headers['x-access-token'] != null) {  //check using json web token
          var token = req.headers['x-access-token'];
          console.log("req.headers.token: " + token);
          jwt.verify(token, process.env.JWT_SECRET, function (err, payload) {
                  console.log(JSON.stringify(payload));
                  if (payload) {
                      if (payload.userId != null){
                          console.log("gotsa payload.userId : " + payload.userId);
                          var oo_id = ObjectID(payload.userId);
                          db.users.findOne({_id: oo_id}, function (err, user) {   //check user status
                              if (err != null) {
                                  req.session.error = 'Access denied!';
                                  console.log("token authentication failed! User ID not found");
                                  res.send('noauth');
                              } else {
                                  console.log("gotsa user " + user._id + " authLevel " + user.authLevel + " status " + user.status);
                                  if (user.status == "validated") {
                                    // userStatus = "subscriber";
                                    // console.log("gotsa vaid user " + user._id);
                                    next();
                                  } else {
                                      req.session.error = 'Access denied!';
                                      console.log("token authentication failed! not a subscriber");
                                      res.send('noauth');    
                                  }
                              }
                          });
                          // next();
                      } else {
                          req.session.error = 'Access denied!';
                          console.log("token authentication failed! headers: " + JSON.stringify(req.headers));
                          res.send('noauth');
                      }
                  } else {
                      req.session.error = 'Access denied!';
                      console.log("token authentication failed! headers: " + JSON.stringify(req.headers));
                      res.send('noauth');
                  }
          });
      } else {
          // req.session.error = 'Access denied!';
          console.log("authentication failed! No cookie or token found");
          res.send('noauth');
      }
  // }
}

function validURL(str) {
    var pattern = new RegExp('^(https?:\\/\\/)?'+ // protocol
      '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|'+ // domain name
      '((\\d{1,3}\\.){3}\\d{1,3}))'+ // OR ip (v4) address
      '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*'+ // port and path
      '(\\?[;&a-z\\d%_.~+=-]*)?'+ // query string
      '(\\#[-a-z\\d_]*)?$','i'); // fragment locator
    return !!pattern.test(str);
  }


  // async function getObject (bucket, objectKey) {
  //   try {
  //     const params = {
  //       Bucket: bucket,
  //       Key: objectKey 
  //     }
  
  //     const data = await s3.getObject(params).promise();
  
  //     return data.Body;
  //   } catch (e) {
  //     throw new Error(`Could not retrieve file from S3: ${e.message}`)
  //   }
  // }
  // async function putObject (bucket, objectKey, data) {
  //   try {
  //     const params = {
  //       Bucket: bucket,
  //       Key: objectKey,
  //       Body: data 
  //     }
  
  //     const data = await s3.putObject(params).promise();
  
  //     return data.Body;
  //   } catch (e) {
  //     throw new Error(`Could not retrieve file from S3: ${e.message}`)
  //   }
  // }

function getExtension(filename) {
    // console.log("tryna get extension of " + filename);
    var i = filename.lastIndexOf('.');
    return (i < 0) ? '' : filename.substr(i);
}

// async function hello() {
//   const ipfs = await IPFS.create();
//   const { cid } = await ipfs.add('Hello world');
//   return cid;
//   }



app.get("/howdy", function (req, res) {
    //send "Hello World" to the client as html
        res.send("howdy!");
});
function UpdateIPFSData (file, theCID, type, id, resp) {
  try {
    const o_id = ObjectID(id.toString());
    db.video_items.updateOne({_id: o_id}, {$set: {cid : theCID}}, {upsert: true});
    console.log(rez + " ipfs data " + file.cid.toString());
    resp.send(file.cid.toString());
  } catch {
    resp.send("data caint");
  }
}



async function IFPSUpUrlSource(videojson, url, type, id, resp) {
  if (ipfsCore == null) {
    console.log("tryna create ipfs");
    ipfsCore = await IPFS.create();
  } try {
    console.log("tryna push to ipfs: " + id + " url " + url);
    var o_id = ObjectID(id.toString());

    // const file = await ipfsCore.add([urlSource(url), {path: id + ".json", content: JSON.stringify(videojson)}], { wrapWithDirectory: true }); //actually adding to ipfs
    const file = await ipfsCore.add(urlSource(url)); //actually adding to ipfs

    console.log("gotsa ipfs file! " + JSON.stringify(file));
    ipfsCore.pin.add(file.cid.toString()); //pin to local node - !await?

    if (type == 'video') {
      const theCID = file.cid.toString();
      console.log("tryna update db with ipfsdata for video file "+ theCID);
      db.video_items.update({_id: o_id}, {$set: {cid : theCID, ipfsData: file}}, {upsert: true},  function (err, saved) {
        if (err || !saved) {
            console.log("prooblemo " + err);
            resp.send('prooblemo ' + err);
        } else {
            console.log("ok saved");
            resp.send(theCID);
        }
      });  
    }
    if (type == 'audio') {
      const theCID = file.cid.toString();
      console.log("tryna update db with ipfsdata for video file "+ theCID);
      db.audio_items.update({_id: o_id}, {$set: {cid : theCID, ipfsData: file}}, {upsert: true},  function (err, saved) {
        if (err || !saved) {
            console.log("prooblemo " + err);
            resp.send('prooblemo ' + err);
        } else {
            console.log("ok saved");
            resp.send(theCID);
        }
      });  
    }
  } catch (e) {
    console.log("error pushing to ipfs "+ e);
    resp.send(e);
  }
}

async function ReturnURL(type, id, responseObj) { //had to (?) pass the response obj from originating method below
  try {
    console.log("lookin for a " + type +  " with ID " + id);
    var o_id = ObjectID(id);
  if (type == "video") {
    
    // let video = null;
    await db.video_items.findOne({"_id": o_id}, function(err, video) {
          if (err || !video) {
              console.log("error getting vidoe item: " + err);
            // return null;
            responseObj.send(err);
              // res.send("no video in db");
          } else {
            const url = s3.getSignedUrl('getObject', {Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + video.userID + '/video/' + video._id + "/" + video._id +"."+ video.filename, Expires: 6000});
            console.log("urll is " + url);
            
            IFPSUpUrlSource(video, url, type, id, responseObj);
          }
      });
    } else if (type == "audio") {
      await db.audio_items.findOne({"_id": o_id}, function(err, audio) {
        if (err || !audio) {
            console.log("error getting audio item: " + err);
          // return null;
          responseObj.send(err);
            // res.send("no video in db");
        } else {
          const url = s3.getSignedUrl('getObject', {Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + audio.userID + '/audio/originals/' + audio._id +'.original.'+ audio.filename, Expires: 6000});
          console.log("urll is " + url);
          
          IFPSUpUrlSource(audio, url, type, id, responseObj);
        }
    });
    } else if (type == "model") {

    } else {
      return null;
    }
  } catch (e) {
    console.log("error pushing to ipfs "+ e);
    return (e);
  }
}

// app.get
// 
  app.get("/ipfs_upl_/:type/:id", cors(corsOptions), requiredAuthentication, function(req, res) {
    //  let url = null;
    console.log("lookin for a " + req.params.type +  " with ID " + req.params.id);
    var o_id = ObjectID(req.params.id);

      if (req.params.type == "video") {
        db.video_items.findOne({"_id": o_id}, function(err, video) {
          if (err || !video) {
              console.log("error getting vidoe item: " + err);
            res.send(err);
          } else {
            let params = {Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + video.userID + '/video/' + video._id + "/" + video._id +"."+ video.filename};     
            s3.headObject(params, function(err, data) { //where it should be
            if (err) { //object isn't in proper folder, copy it over
              console.log("error finding original audio file " + err);
              res.send(err);
            } else {
              (async () => {
                try {
                if (ipfsCore == null) {
                  console.log("tryna create ipfs");
                  ipfsCore = await IPFS.create();
                }
                const url = await s3.getSignedUrl('getObject', params);
                console.log("tryna push to ipfs: " + req.params.id + " url " + url);

                const file = await ipfsCore.add(urlSource(url)); //actually adding to ipfs
            
                console.log("gotsa ipfs file! " + JSON.stringify(file));
                ipfsCore.pin.add(file.cid.toString());
                const theCID = file.cid.toString();
                console.log("tryna update db with ipfsdata for video file "+ theCID);
                db.video_items.update({_id: o_id}, {$set: {cid : theCID}}, {upsert: true},  function (err, saved) {
                if (err || !saved) {
                    console.log("prooblemo " + err);
                    res.send('prooblemo ' + err);
                } else {
                    console.log("ok saved");
                    res.send(theCID);
                }
              });  
              } catch (e) {
                res.send(e);
              }
            })();
            }
          });
        }
      });
        // db.video_items.findOne({"_id": o_id}, function(err, video) {
        //     if (err || !video) {
        //         console.log("error getting vidoe item: " + err);
        //       res.send(err);
        //     } else {

        //     //   (async () => {
        //     //   if (ipfsCore == null) {
        //     //       console.log("tryna create ipfs");
        //     //       ipfsCore = await IPFS.create();
        //     //   }
        //     //   const url = await s3.getSignedUrl('getObject', {Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + video.userID + '/video/' + video._id + "/" + video._id +"."+ video.filename, Expires: 6000});
              
        //     //   console.log("tryna push video to ipfs: " + req.params.id + " url " + url); 
          
        //     //   // const file = await ipfsCore.add([urlSource(url), {path: id + ".json", content: JSON.stringify(videojson)}], { wrapWithDirectory: true }); //actually adding to ipfs
        //     //   const file = await ipfsCore.add(urlSource(url)); //actually adding to ipfs - better to download? 
          
        //     //   console.log("gotsa ipfs file! " + JSON.stringify(file));
        //     //   ipfsCore.pin.add(file.cid.toString());
        //     //   const theCID = file.cid.toString();
        //     //   console.log("tryna update db with ipfsdata for video file "+ theCID);
        //     //   db.video_items.update({_id: o_id}, {$set: {cid : theCID}}, {upsert: true},  function (err, saved) {
        //     //   if (err || !saved) {
        //     //       console.log("prooblemo " + err);
        //     //       res.send('prooblemo ' + err);
        //     //   } else {
        //     //       console.log("ok saved");
        //     //       res.send(theCID);
        //     //   }
        //     //   });  
        //     // })();
        //   }
        // });
        } else if (req.params.type == "audio") {
          db.audio_items.findOne({"_id": o_id}, function(err, audio) {
            if (err || !audio) {
                console.log("error getting vidoe item: " + err);
              res.send(err);
            } else {
              let params = {Bucket: process.env.ROOT_BUCKET_NAME, Key: "users/" + audio.userID + "/audio/" + audio._id +"."+path.parse(audio.filename).name + ".mp3"};     
              s3.headObject(params, function(err, data) { //where it should be
              if (err) { //object isn't in proper folder, copy it over?
                console.log("error finding original audio file " + err);
                res.send(err);
              } else {
                (async () => {
                  try {
                  if (ipfsCore == null) {
                    console.log("tryna create ipfs");
                    ipfsCore = await IPFS.create();
                  }
                  const url = await s3.getSignedUrl('getObject', params);
                  console.log("tryna push to ipfs: " + req.params.id + " url " + url);

                  const file = await ipfsCore.add(urlSource(url)); //actually adding to ipfs
              
                  console.log("gotsa ipfs file! " + JSON.stringify(file));
                  ipfsCore.pin.add(file.cid.toString());
                  const theCID = file.cid.toString();
                  console.log("tryna update db with ipfsdata for video file "+ theCID);
                  db.audio_items.update({_id: o_id}, {$set: {cid : theCID}}, {upsert: true},  function (err, saved) {
                  if (err || !saved) {
                      console.log("prooblemo " + err);
                      res.send('prooblemo ' + err);
                  } else {
                      console.log("ok saved");
                      res.send(theCID);
                  }
                });
                } catch (e) {
                  
                }  
              })();
              }
            });
          }
        });
            // (async () => {
            // await db.audio_items.findOne({"_id": o_id}, function(err, audio) {
            //   if (err || !audio) {
            //       console.log("error getting audio item: " + err);
            //     // return null;
            //     responseObj.send(err);
            //       // res.send("no video in db");
            //   } else {
            //     const url = s3.getSignedUrl('getObject', {Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + audio.userID + '/audio/originals/' + audio._id +'.original.'+ audio.filename, Expires: 6000});
            //     console.log("urll is " + url);
                
            //     IFPSUpUrlSource(audio, url, type, id, responseObj);
            //   }
            // });
          // })();
          } else if (req.params.type == "model") {
            db.models.findOne({"_id": o_id}, function(err, model) {
              if (err || !model) {
                  console.log("error getting model: " + err);
                res.send(err);
              } else {
                let folder = "gltf"; //todo check for usdz
                let params = {Bucket: process.env.ROOT_BUCKET_NAME, Key: "users/" + model.userID + "/"+folder+"/"+model.filename};     
                s3.headObject(params, function(err, data) { //where it should be
                if (err) { //object isn't in proper folder, copy it over?
                  console.log("error finding original model file " + err);
                  res.send(err);
                } else {
                  (async () => {
                    try {
                      if (ipfsCore == null) {
                        console.log("tryna create ipfs");
                        ipfsCore = await IPFS.create();
                      }
                      const url = await s3.getSignedUrl('getObject', params);
                      console.log("tryna push to ipfs: " + req.params.id + " url " + url);
    
                      const file = await ipfsCore.add(urlSource(url)); //actually adding to ipfs
                  
                      console.log("gotsa ipfs file! " + JSON.stringify(file));
                      ipfsCore.pin.add(file.cid.toString());
                      const theCID = file.cid.toString();
                      console.log("tryna update db with ipfsdata for video file "+ theCID);
                      db.models.update({_id: o_id}, {$set: {cid : theCID}}, {upsert: true},  function (err, saved) {
                      if (err || !saved) {
                          console.log("prooblemo " + err);
                          res.send('prooblemo ' + err);
                      } else {
                          console.log("ok saved");
                          res.send(theCID);
                      }
                    });
                    } catch (e) {
                      
                    }  
                  })();
                }
              });
            }
          });
          } else {
            return null;
          }
      // } catch {
      //   res.send("there was an error!");
      // }
   
  });
  
// app.get("/ipfs_up/:type/:id", async function(req, res) {
//   //  let url = null;

//   try {
//     if (ipfsCore == null) {
//       console.log("tryna create ipfs");
//       ipfsCore = await IPFS.create();
//     } 

      
//     ReturnURL(req.params.type, req.params.id, res);
     
//   } catch (e) {
//     res.send(e);
//     // next(e);
//   }
// });

app.get("/local_pinned_", async function(req, res, next) {
  if (ipfsCore == null) {
      console.log("tryna create ipfs");
      ipfsCore = await IPFS.create();
  }
  try {
    let pinned = [];
    for await (const { cid, type } of ipfsCore.pin.ls()) {
      // ipfs.pin.add(cid.toString());
      
      if (cid != undefined) {
        
        // await ipfsCore.pin.rm(cid.toString());
        // console.log("unpinned " +cid.toString());
        if (type != "indirect") {
          pinned.push(cid.toString());
          console.log("pinned item: " +cid.toString() + " type " + type);
        }
      }
    }
    res.send(JSON.stringify(pinned));
  } catch(e) {
    next(e)
  }
    // let pinned = await ipfsCore.pin.ls();
    // console.log("pinned " + JSON.stringify(pinned));
});

app.get("/ipfs_test_", async function(req, res, next) {
  //  let hello = hello();
  // console.log("wtf");
  if (ipfsCore == null) {
    console.log("tryna create ipfs");
    ipfsCore = await IPFS.create();
  }
  try {

    // const { cid } = await ipfs.add({path: 'strangeMother.mp3', content: urlSource('http://kork.us.s3.amazonaws.com/audio/StrangeMother.mp3')});
    // console.log('added' + cid.toString());
    // await ipfs.pin.add(cid.toString());

    // const { urlSource } = IpfsHttpClient;
    // const ipfs = IpfsHttpClient();
    const file = await ipfsHttpClient.add(urlSource('http://kork.us.s3.amazonaws.com/audio/StrangeMother.mp3'));
      console.log(file);
      ipfsCore.pin.add(file.cid.toString());
    // }
    // for await (const { cid, type } of ipfs.pin.ls()) {
    //   // ipfs.pin.add(cid.toString());
    //   if (cid != undefined) {
    //     console.log("pinned " +cid.toString());
    //   }
      
    // }
    res.send(file);
  } catch (e) {
    //this will eventually be handled by your error handling middlewared
    // res.send(e);
    next(e);
  }
});

// a[[]].get('/user/:id', async (req, res, next) => {
//   try {
//     const user = await getUserFromDb({ id: req.params.id })
//     res.json(user);
//   } catch (e) {
//     //this will eventually be handled by your error handling middleware
//     next(e) 
//   }
// })

app.get("/scrape_webpage/:pageurl", cors(corsOptions), requiredAuthentication, function (req, res) {
    let url = "https://" + req.params.pageurl;
    (async () => {
        console.log("tryna scrape " + url);
        let response = "";
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        const override = Object.assign(page.viewport(), {width: 1024, height: 1024});
        await page.setViewport(override);
        await page.goto(url);
        const pagepic = await page.screenshot({fullPage: false});
        await sharp(pagepic)
        .resize({
          kernel: sharp.kernel.nearest,
          width: 1024,
          width: 1024,
          fit: 'fill'
        })
        .toBuffer()
        .then(data => {
            let buf = Buffer.from(data);
            let encodedData = buf.toString('base64');
            response = "<img src=\x22data:image/jpeg;base64," + encodedData +"\x22>";
            // console.log("response: " + response);
            // res.send(response);
        })
        .catch(err => {console.log(err); res.send(err);});
        await sharp(pagepic)
        .resize({
          kernel: sharp.kernel.nearest,
          width: 512,
          width: 512,
          fit: 'cover'
        })
        .toBuffer()
        .then(data => {
            let buf = Buffer.from(data);
            let encodedData = buf.toString('base64');
            response = response + "<img src=\x22data:image/jpeg;base64," + encodedData +"\x22>";
            // console.log("response: " + response);
            // res.send(response);
        })
        .catch(err => {console.log(err); res.send(err);});
        await sharp(pagepic)
        .resize({
          kernel: sharp.kernel.nearest,
          width: 256,
          width: 256,
          fit: 'cover'
        })
        .toBuffer()
        .then(data => {
            let buf = Buffer.from(data);
            let encodedData = buf.toString('base64');
            response = response + "<img src=\x22data:image/jpeg;base64," + encodedData +"\x22>";
            // console.log("response: " + response);
            res.send(response);
        })
        .catch(err => {console.log(err); res.send(err);});
        await browser.close();
    })();
});

app.post("/scrapeweb_rt/", cors(corsOptions), requiredAuthentication, function (req, res) {
    
});

app.post("/scrapeweb/", cors(corsOptions), requiredAuthentication, function (req, res) {
  // let url = req.body.pageurl;
  // let title = req.body.title;
  console.log("scrapeweb req with body "+ JSON.stringify(req.body));
  db.weblinks.findOne({ "_id" : ObjectID(req.body._id)}, function(err, link) {

    if (err || ! link) {
      console.log("no link found or error for " + req.body._id);
    } else {
      console.log("link: " + JSON.stringify(link));
    let url = link.link_url;
    (async () => {
        console.log("tryna scrape " + url);
        let response = "";
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        const override = Object.assign(page.viewport(), {width: 1024, height: 1024});
        await page.setViewport(override);
        await page.goto(url);
        const pagepic = await page.screenshot({fullPage: false});
        await sharp(pagepic)
        .resize({
          kernel: sharp.kernel.nearest,
          width: 1024,
          width: 1024,
          fit: 'fill'
        })
        .toBuffer()
        .then(rdata => {
          s3.putObject({
            Bucket: process.env.WEBSCRAPE_BUCKET_NAME,
            Key: link._id + "/" + link._id + ".standard.jpg",
            Body: rdata,
            ContentType: 'image/jpg'
          }, function (error, resp) {
              if (error) {
                console.log('error putting  pic' + error);
                res.send(error);
              } else {
                // console.log("key : " +process.env.WEBSCRAPE_BUCKET_NAME + "/" + link._id + "/" + link._id + ".standard.jpg",)
                console.log('Successfully uploaded  pic with with response: ' + JSON.stringify(resp));
              }
          })
        })
        .catch(err => {console.log(err); res.send(err);});
        await sharp(pagepic)
        .resize({
          kernel: sharp.kernel.nearest,
          width: 512,
          width: 512,
          fit: 'cover'
        })
        .toBuffer()
        .then(rdata => {
          s3.putObject({
            Bucket: process.env.WEBSCRAPE_BUCKET_NAME,
            Key: link._id + "/" + link._id + ".half.jpg",
            Body: rdata,
            ContentType: 'image/jpg'
          }, function (error, resp) {
              if (error) {
                console.log('error putting  pic' + error);
              } else {
                console.log('Successfully uploaded  pic with response: ' + JSON.stringify(resp));
              }
          })
        })
        .catch(err => {console.log(err); res.send(err);});
        await sharp(pagepic)
        .resize({
          kernel: sharp.kernel.nearest,
          width: 128,
          width: 128,
          fit: 'cover'
        })
        .toBuffer()
        .then(rdata => {
          s3.putObject({
            Bucket: process.env.WEBSCRAPE_BUCKET_NAME,
            Key: link._id + "/" + link._id + ".thumb.jpg",
            Body: rdata,
            ContentType: 'image/jpg'
          }, function (error, resp) {
              if (error) {
                console.log('error putting  pic' + error);
              } else {
                console.log('Successfully uploaded  pic with response: ' + resp);
                
              }
          })
        
        })
        .catch(err => {console.log(err); res.send(err);});
        await browser.close();

      })();
      res.send("web scrape successful!");
    }
  });
});

// app.post("/scrape_webpage/", function (req, res) {
//     if (validURL(req.body.pageurl)) {
//     let url = req.body.pageurl;
//     (async () => {
//         console.log("trina scrape...");
//         let response = "";
//         const browser = await puppeteer.launch();
//         const page = await browser.newPage();
//         const override = Object.assign(page.viewport(), {width: 1024, height: 1024});
//         await page.setViewport(override);
//         await page.goto(url);
//         const pagepic = await page.screenshot({fullPage: true});
//         await sharp(pagepic)
//         .resize({
//           kernel: sharp.kernel.nearest,
//           width: 1024,
//           width: 1024,
//           fit: 'fill'
//         })
//         .toBuffer()
//         .then(data => {
//             let buf = Buffer.from(data);
//             let encodedData = buf.toString('base64');
//             response = "<img src=\x22data:image/jpeg;base64," + encodedData +"\x22>";
//             // console.log("response: " + response);
//             res.send(response);
//         })
//         .catch(err => {console.log(err); res.send(err);});
//         await sharp(pagepic)
//         .resize({
//           kernel: sharp.kernel.nearest,
//           width: 512,
//           width: 512,
//           fit: 'cover'
//         })
//         .toBuffer()
//         .then(data => {
//             let buf = Buffer.from(data);
//             let encodedData = buf.toString('base64');
//             response = response + "<img src=\x22data:image/jpeg;base64," + encodedData +"\x22>";
//             // console.log("response: " + response);
//             res.send(response);
//         })
//         .catch(err => {console.log(err); res.send(err);});
//         await sharp(pagepic)
//         .resize({
//           kernel: sharp.kernel.nearest,
//           width: 256,
//           width: 256,
//           fit: 'cover'
//         })
//         .toBuffer()
//         .then(data => {
//             let buf = Buffer.from(data);
//             let encodedData = buf.toString('base64');
//             response = response + "<img src=\x22data:image/jpeg;base64," + encodedData +"\x22>";
//             // console.log("response: " + response);
//             res.send(response);
//         })
//         .catch(err => {console.log(err); res.send(err);});
//         await browser.close();
//         })();
//     } else {
//         res.send("invalid url");
//     }
// });

app.get('/resize_uploaded_picture/:_id', cors(corsOptions), requiredAuthentication, function (req, res) { //presumes pic has already been uploaded to production folder and db entry made
    console.log("tryna resize pic with key: " + req.params._id);
    var o_id = ObjectID(req.params._id);
    db.image_items.findOne({"_id": o_id}, function(err, image) {
      if (err || !image) {
        console.log("error getting image item: " + err);
        callback("no image in db");
        res.send("no image in db");
      } else {
          let oKey = "users/" + image.userID + "/pictures/originals/" + image._id +".original."+image.filename;
          var params = {Bucket: process.env.ROOT_BUCKET_NAME, Key: oKey};
          let extension = getExtension(image.filename).toLowerCase();
          let contentType = 'image/jpeg';
          let format = 'jpg';
          if (extension == ".PNG" || extension == ".png") {
            contentType = 'image/png';
            format = 'png';
          }
          // s3.headObject(params, function (err, url) { //first check that the original file is in place
          //   if (err) {
          //       console.log(err);
          //       res.send("no image in bucket");
          //   } else {
            // if (err) {
            //     console.log(err);
            //     res.send("couldn't get no image data");
            // } else {
        (async () => { //do these jerbs one at a time..
        
        if (minioClient) {
            
            let key = "users/" + image.userID + "/pictures/originals/" + image._id +".original."+image.filename;
            let savedLocation = process.env.LOCAL_TEMP_FOLDER + image.filename;
            await DownloadMinioFile(process.env.ROOT_BUCKET_NAME, key, savedLocation)
            .then()
            .catch({if (err){return}});
            
            if (format == "jpg") {
              await sharp(process.env.LOCAL_TEMP_FOLDER + image.filename)
              .resize({
                kernel: sharp.kernel.nearest,
                height: 1024,
                width: 1024,
                fit: 'contain'
              })
              .extend({
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
                background: { r: 0, g: 0, b: 0, alpha: 1 }
              })
              .toFormat(format)
              .toBuffer()
              .then(rdata => {
                minioClient.putObject(process.env.ROOT_BUCKET_NAME, "users/" + image.userID + "/pictures/" + image._id +".standard."+image.filename, rdata, function(err, objInfo) {
                  if(err) {
                      console.log("minioerr: " + err) // err should be null
                  } else {
                      console.log("Success with standard pic", objInfo)
                  }
                });
              })
              .catch(err => {console.log(err); res.send(err);});              
              await sharp(process.env.LOCAL_TEMP_FOLDER + image.filename)
              .resize({
                kernel: sharp.kernel.nearest,
                height: 512,
                width: 512,
                fit: 'contain'
              })
              .extend({
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
                background: { r: 0, g: 0, b: 0, alpha: 1 }
              })
              .toFormat(format)
              .toBuffer()
              .then(rdata => {
                minioClient.putObject(process.env.ROOT_BUCKET_NAME, "users/" + image.userID + "/pictures/" + image._id +".half."+image.filename, rdata, function(err, objInfo) {
                  if(err) {
                      console.log("minioerr: " + err) // err should be null
                  } else {
                      console.log("Success with standard pic", objInfo)
                  }
                });
              })
              .catch(err => {console.log(err); res.send(err);});
              await sharp(process.env.LOCAL_TEMP_FOLDER + image.filename)
              .resize({
                kernel: sharp.kernel.nearest,
                height: 256,
                width: 256,
                fit: 'contain'
              })
              .extend({
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
                background: { r: 0, g: 0, b: 0, alpha: 1 }
              })
              .toFormat(format)
              .toBuffer()
              .then(rdata => {
                minioClient.putObject(process.env.ROOT_BUCKET_NAME, "users/" + image.userID + "/pictures/" + image._id +".quarter."+image.filename, rdata, function(err, objInfo) {
                  if(err) {
                      console.log("minioerr: " + err) // err should be null
                  } else {
                      console.log("Success with standard pic", objInfo)
                  }
                });
              })
              .catch(err => {console.log(err); res.send(err);});
              await sharp(process.env.LOCAL_TEMP_FOLDER + image.filename)
              .resize({
                kernel: sharp.kernel.nearest,
                height: 128,
                width: 128,
                fit: 'contain'
              })
              .extend({
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
                background: { r: 0, g: 0, b: 0, alpha: 1 }
              })
              .toFormat(format)
              .toBuffer()
              .then(rdata => {
                minioClient.putObject(process.env.ROOT_BUCKET_NAME, "users/" + image.userID + "/pictures/" + image._id +".thumb."+image.filename, rdata, function(err, objInfo) {
                  if(err) {
                      console.log("minioerr: " + err) // err should be null
                  } else {
                      console.log("Success with standard pic", objInfo)
                  }
                });
              })
              .catch(err => {console.log(err); res.send(err);});
              console.log("pics have been mangled!");  
              res.send("resize successful!");
              
            } else { //if png, keep bg transparent
              console.log("format != jpg");
              await sharp(process.env.LOCAL_TEMP_FOLDER + image.filename)
              .resize({
                kernel: sharp.kernel.nearest,
                height: 1024,
                width: 1024,
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 }
              })
              .toFormat(format)
              .toBuffer()
              .then(rdata => {
                minioClient.putObject(process.env.ROOT_BUCKET_NAME, "users/" + image.userID + "/pictures/" + image._id +".standard."+image.filename, rdata, function(err, objInfo) {
                  if(err) {
                      console.log("minioerr: " + err) // err should be null
                  } else {
                      console.log("Success with standard pic", objInfo)
                  }
                });
              })
              .catch(err => {console.log(err); res.send(err);});
              await sharp(process.env.LOCAL_TEMP_FOLDER + image.filename)
              .resize({
                kernel: sharp.kernel.nearest,
                height: 512,
                width: 512,
                fit: 'contain',
                ackground: { r: 0, g: 0, b: 0, alpha: 0 }
              })
              .toFormat(format)
              .toBuffer()
              .then(rdata => {
                minioClient.putObject(process.env.ROOT_BUCKET_NAME, "users/" + image.userID + "/pictures/" + image._id +".half."+image.filename, rdata, function(err, objInfo) {
                  if(err) {
                      console.log("minioerr: " + err) // err should be null
                  } else {
                      console.log("Success with standard pic", objInfo)
                  }
                });
              })
              .catch(err => {console.log(err); res.send(err);});
              await sharp(process.env.LOCAL_TEMP_FOLDER + image.filename)
              .resize({
                kernel: sharp.kernel.nearest,
                height: 256,
                width: 256,
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 }
              })
              .toFormat(format)
              .toBuffer()
              .then(rdata => {
                minioClient.putObject(process.env.ROOT_BUCKET_NAME, "users/" + image.userID + "/pictures/" + image._id +".quarter."+image.filename, rdata, function(err, objInfo) {
                  if(err) {
                      console.log("minioerr: " + err) // err should be null
                  } else {
                      console.log("Success with standard pic", objInfo)
                  }
                });
              })
              .catch(err => {console.log(err); res.send(err);});
              await sharp(process.env.LOCAL_TEMP_FOLDER + image.filename)
              .resize({
                kernel: sharp.kernel.nearest,
                height: 128,
                width: 128,
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 }
              })
              .toFormat(format)
              .toBuffer()
              .then(rdata => {
                minioClient.putObject(process.env.ROOT_BUCKET_NAME, "users/" + image.userID + "/pictures/" + image._id +".thumb."+image.filename, rdata, function(err, objInfo) {
                  if(err) {
                      console.log("minioerr: " + err) // err should be null
                  } else {
                      console.log("Success with standard pic", objInfo)
                  }
                });
              })
              .catch(err => {console.log(err); res.send(err);});
              console.log("pics have been mangled!");
              res.send("resize successful!");
            }
        } else { /////////////////--------- s3 mode below..
            let data = await s3.getObject(params).promise();
            if (format == 'jpg') {
            await sharp(data.Body)
            .resize({
              kernel: sharp.kernel.nearest,
              height: 1024,
              width: 1024,
              fit: 'contain'
            })
            .extend({
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              background: { r: 0, g: 0, b: 0, alpha: 1 }
            })
            .toFormat(format)
            .toBuffer()
            .then(rdata => {
                s3.putObject({
                  Bucket: process.env.ROOT_BUCKET_NAME,
                  Key: "users/" + image.userID + "/pictures/" + image._id +".standard."+image.filename,
                  Body: rdata,
                  ContentType: contentType
                }, function (error, resp) {
                    if (error) {
                      console.log('error putting  pic' + error);
                    } else {
                      console.log('Successfully uploaded  pic with response: ' + resp);
                    }
                })
              // }
            })
            .catch(err => {console.log(err); res.send(err);});

            await sharp(data.Body)
            .resize({
              kernel: sharp.kernel.nearest,
              height: 512,
              width: 512,
              fit: 'contain'
            })
            .extend({
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              background: { r: 0, g: 0, b: 0, alpha: 1 }
            })
            .toFormat(format)
            .toBuffer()
            .then(rdata => {
                s3.putObject({
                    Bucket: process.env.ROOT_BUCKET_NAME,
                    Key: "users/" + image.userID + "/pictures/" + image._id +".half."+image.filename,
                    Body: rdata,
                    ContentType: contentType
                  }, function (error, resp) {
                    if (error) {
                      console.log('error putting  pic' + error);
                    } else {
                      console.log('Successfully uploaded  pic with response: ' + resp);
                    }
                })
              })
            .catch(err => {console.log(err); res.send(err);});
            await sharp(data.Body)
            .resize({
              kernel: sharp.kernel.nearest,
              height: 256,
              width: 256,
              fit: 'contain'
            })
            .extend({
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              background: { r: 0, g: 0, b: 0, alpha: 1 }
            })
            .toFormat(format)
            .toBuffer()
            .then(rdata => {
                // let buf = Buffer.from(rdata);
                // let encodedData = rdata.toString('base64');
                s3.putObject({
                    Bucket: process.env.ROOT_BUCKET_NAME,
                    Key: "users/" + image.userID + "/pictures/" + image._id +".quarter."+image.filename,
                    Body: rdata,
                    ContentType: contentType
                  }, function (error, resp) {
                    if (error) {
                      console.log('error putting  pic' + error);
                    } else {
                      console.log('Successfully uploaded  pic with response: ' + resp);
                    }
                })
              })
            .catch(err => {console.log(err); res.send(err);});
            await sharp(data.Body)
            .resize({
              kernel: sharp.kernel.nearest,
              height: 128,
              width: 128,
              fit: 'contain'
            })
            .extend({
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              background: { r: 0, g: 0, b: 0, alpha: 1 }
            })
            .toFormat(format)
            .toBuffer()
            .then(rdata => {
                s3.putObject({
                    Bucket: process.env.ROOT_BUCKET_NAME,
                    Key: "users/" + image.userID + "/pictures/" + image._id +".thumb."+image.filename,
                    Body: rdata,
                    ContentType: contentType
                  }, function (error, resp) {
                    if (error) {
                      console.log('error putting  pic' + error);
                    } else {
                      console.log('Successfully uploaded  pic with response: ' + resp);
                    }
                })
              })
            .catch(err => {console.log(err); res.send(err);});
            console.log("pics have been mangled!");  
            res.send("resize successful!");
            
          } else { //if png, keep bg transparent
            console.log("format != jpg");
            await sharp(data.Body)
            .resize({
              kernel: sharp.kernel.nearest,
              height: 1024,
              width: 1024,
              fit: 'contain',
              background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .toFormat(format)
            .toBuffer()
            .then(rdata => {
                  s3.putObject({
                    Bucket: process.env.ROOT_BUCKET_NAME,
                    Key: "users/" + image.userID + "/pictures/" + image._id +".standard."+image.filename,
                    Body: rdata,
                    ContentType: contentType
                  }, function (error, resp) {
                      if (error) {
                        console.log('error putting  pic' + error);
                      } else {
                        console.log('Successfully uploaded  pic with response: ' + resp);
                      }
                  })
                })
            .catch(err => {console.log(err); res.send(err);});
            await sharp(data.Body)
            .resize({
              kernel: sharp.kernel.nearest,
              height: 512,
              width: 512,
              fit: 'contain',
              ackground: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .toFormat(format)
            .toBuffer()
            .then(rdata => {
                s3.putObject({
                    Bucket: process.env.ROOT_BUCKET_NAME,
                    Key: "users/" + image.userID + "/pictures/" + image._id +".half."+image.filename,
                    Body: rdata,
                    ContentType: contentType
                  }, function (error, resp) {
                    if (error) {
                      console.log('error putting  pic' + error);
                    } else {
                      console.log('Successfully uploaded  pic with response: ' + resp);
                    }
                })
              })
            .catch(err => {console.log(err); res.send(err);});
            await sharp(data.Body)
            .resize({
              kernel: sharp.kernel.nearest,
              height: 256,
              width: 256,
              fit: 'contain',
              background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .toFormat(format)
            .toBuffer()
            .then(rdata => {
                // let buf = Buffer.from(rdata);
                // let encodedData = rdata.toString('base64');
                s3.putObject({
                    Bucket: process.env.ROOT_BUCKET_NAME,
                    Key: "users/" + image.userID + "/pictures/" + image._id +".quarter."+image.filename,
                    Body: rdata,
                    ContentType: contentType
                  }, function (error, resp) {
                    if (error) {
                      console.log('error putting  pic' + error);
                    } else {
                      console.log('Successfully uploaded  pic with response: ' + resp);
                    }
                })
              })
            .catch(err => {console.log(err); res.send(err);});
            await sharp(data.Body)
            .resize({
              kernel: sharp.kernel.nearest,
              height: 128,
              width: 128,
              fit: 'contain',
              background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .toFormat(format)
            .toBuffer()
            .then(rdata => {
                s3.putObject({
                    Bucket: process.env.ROOT_BUCKET_NAME,
                    Key: "users/" + image.userID + "/pictures/" + image._id +".thumb."+image.filename,
                    Body: rdata,
                    ContentType: contentType
                  }, function (error, resp) {
                    if (error) {
                      console.log('error putting  pic' + error);
                    } else {
                      console.log('Successfully uploaded  pic with response: ' + resp);
                    }
                })
              })
            .catch(err => {console.log(err); res.send(err);});
            console.log("pics have been mangled!");
            res.send("resize successful!");
          
            }
          }
        })();//end async
        }
      });
  });
      

app.get('/resize_uploaded_picture_old/:_id', cors(corsOptions), requiredAuthentication, function (req, res) { //presumes pic has already been uploaded to production folder and db entry made
  console.log("tryna resize pic with key: " + req.params._id);
  var o_id = ObjectID(req.params._id);
  db.image_items.findOne({"_id": o_id}, function(err, image) {
      if (err || !image) {
          console.log("error getting image item: " + err);
          callback("no image in db");
          res.send("no image in db");
      } else {
          var params = {Bucket: process.env.ROOT_BUCKET_NAME, Key: "users/" + image.userID + "/pictures/originals/" + image._id +".original."+image.filename};
          let extension = getExtension(image.filename).toLowerCase();
          let contentType = 'image/jpeg';
          let format = 'jpg';
          if (extension == ".PNG" || extension == ".png") {
            contentType = 'image/png';
            format = 'png';
          }
          s3.headObject(params, function (err, url) { //first check that the original file is in place
            if (err) {
                console.log(err);
                res.send("no image in bucket");
            } else {
            // if (err) {
            //     console.log(err);
            //     res.send("couldn't get no image data");
            // } else {
                (async () => { //do these jerbs one at a time..
                  // console.log
                  
                let data = await s3.getObject(params).promise();
                if (format == 'jpg') {
                await sharp(data.Body)
                .resize({
                  kernel: sharp.kernel.nearest,
                  height: 1024,
                  width: 1024,
                  fit: 'contain'
                })
                .extend({
                  top: 0,
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: { r: 0, g: 0, b: 0, alpha: 1 }
                })
                .toFormat(format)
                .toBuffer()
                .then(rdata => {
                    s3.putObject({
                      Bucket: process.env.ROOT_BUCKET_NAME,
                      Key: "users/" + image.userID + "/pictures/" + image._id +".standard."+image.filename,
                      Body: rdata,
                      ContentType: contentType
                    }, function (error, resp) {
                        if (error) {
                          console.log('error putting  pic' + error);
                        } else {
                          console.log('Successfully uploaded  pic with response: ' + resp);
                        }
                    })
                  // }
                })
                .catch(err => {console.log(err); res.send(err);});

                await sharp(data.Body)
                .resize({
                  kernel: sharp.kernel.nearest,
                  height: 512,
                  width: 512,
                  fit: 'contain'
                })
                .extend({
                  top: 0,
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: { r: 0, g: 0, b: 0, alpha: 1 }
                })
                .toFormat(format)
                .toBuffer()
                .then(rdata => {
                    s3.putObject({
                        Bucket: process.env.ROOT_BUCKET_NAME,
                        Key: "users/" + image.userID + "/pictures/" + image._id +".half."+image.filename,
                        Body: rdata,
                        ContentType: contentType
                      }, function (error, resp) {
                        if (error) {
                          console.log('error putting  pic' + error);
                        } else {
                          console.log('Successfully uploaded  pic with response: ' + resp);
                        }
                    })
                  })
                .catch(err => {console.log(err); res.send(err);});
                await sharp(data.Body)
                .resize({
                  kernel: sharp.kernel.nearest,
                  height: 256,
                  width: 256,
                  fit: 'contain'
                })
                .extend({
                  top: 0,
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: { r: 0, g: 0, b: 0, alpha: 1 }
                })
                .toFormat(format)
                .toBuffer()
                .then(rdata => {
                    // let buf = Buffer.from(rdata);
                    // let encodedData = rdata.toString('base64');
                    s3.putObject({
                        Bucket: process.env.ROOT_BUCKET_NAME,
                        Key: "users/" + image.userID + "/pictures/" + image._id +".quarter."+image.filename,
                        Body: rdata,
                        ContentType: contentType
                      }, function (error, resp) {
                        if (error) {
                          console.log('error putting  pic' + error);
                        } else {
                          console.log('Successfully uploaded  pic with response: ' + resp);
                        }
                    })
                  })
                .catch(err => {console.log(err); res.send(err);});
                await sharp(data.Body)
                .resize({
                  kernel: sharp.kernel.nearest,
                  height: 128,
                  width: 128,
                  fit: 'contain'
                })
                .extend({
                  top: 0,
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: { r: 0, g: 0, b: 0, alpha: 1 }
                })
                .toFormat(format)
                .toBuffer()
                .then(rdata => {
                    // let buf = Buffer.from(rdata);
                    // let encodedData = rdata.toString('base64');
                    s3.putObject({
                        Bucket: process.env.ROOT_BUCKET_NAME,
                        Key: "users/" + image.userID + "/pictures/" + image._id +".thumb."+image.filename,
                        Body: rdata,
                        ContentType: contentType
                      }, function (error, resp) {
                        if (error) {
                          console.log('error putting  pic' + error);
                        } else {
                          console.log('Successfully uploaded  pic with response: ' + resp);
                        }
                    })
                  })
                .catch(err => {console.log(err); res.send(err);});
                console.log("pics have been mangled!");  
                res.send("resize successful!");
                
              } else { //if png, keep bg transparent
                console.log("format != jpg");
                await sharp(data.Body)
                .resize({
                  kernel: sharp.kernel.nearest,
                  height: 1024,
                  width: 1024,
                  fit: 'contain',
                  background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .toFormat(format)
                .toBuffer()
                .then(rdata => {
                      s3.putObject({
                        Bucket: process.env.ROOT_BUCKET_NAME,
                        Key: "users/" + image.userID + "/pictures/" + image._id +".standard."+image.filename,
                        Body: rdata,
                        ContentType: contentType
                      }, function (error, resp) {
                          if (error) {
                            console.log('error putting  pic' + error);
                          } else {
                            console.log('Successfully uploaded  pic with response: ' + resp);
                          }
                      })
                    })
                .catch(err => {console.log(err); res.send(err);});
                await sharp(data.Body)
                .resize({
                  kernel: sharp.kernel.nearest,
                  height: 512,
                  width: 512,
                  fit: 'contain',
                  ackground: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .toFormat(format)
                .toBuffer()
                .then(rdata => {
                    s3.putObject({
                        Bucket: process.env.ROOT_BUCKET_NAME,
                        Key: "users/" + image.userID + "/pictures/" + image._id +".half."+image.filename,
                        Body: rdata,
                        ContentType: contentType
                      }, function (error, resp) {
                        if (error) {
                          console.log('error putting  pic' + error);
                        } else {
                          console.log('Successfully uploaded  pic with response: ' + resp);
                        }
                    })
                  })
                .catch(err => {console.log(err); res.send(err);});
                await sharp(data.Body)
                .resize({
                  kernel: sharp.kernel.nearest,
                  height: 256,
                  width: 256,
                  fit: 'contain',
                  background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .toFormat(format)
                .toBuffer()
                .then(rdata => {
                    // let buf = Buffer.from(rdata);
                    // let encodedData = rdata.toString('base64');
                    s3.putObject({
                        Bucket: process.env.ROOT_BUCKET_NAME,
                        Key: "users/" + image.userID + "/pictures/" + image._id +".quarter."+image.filename,
                        Body: rdata,
                        ContentType: contentType
                      }, function (error, resp) {
                        if (error) {
                          console.log('error putting  pic' + error);
                        } else {
                          console.log('Successfully uploaded  pic with response: ' + resp);
                        }
                    })
                  })
                .catch(err => {console.log(err); res.send(err);});
                await sharp(data.Body)
                .resize({
                  kernel: sharp.kernel.nearest,
                  height: 128,
                  width: 128,
                  fit: 'contain',
                  background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .toFormat(format)
                .toBuffer()
                .then(rdata => {
                    // let buf = Buffer.from(rdata);
                    // let encodedData = rdata.toString('base64');
                    
                    s3.putObject({
                        Bucket: process.env.ROOT_BUCKET_NAME,
                        Key: "users/" + image.userID + "/pictures/" + image._id +".thumb."+image.filename,
                        Body: rdata,
                        ContentType: contentType
                      }, function (error, resp) {
                        if (error) {
                          console.log('error putting  pic' + error);
                        } else {
                          console.log('Successfully uploaded  pic with response: ' + resp);
                        }
                    })
                  })
                .catch(err => {console.log(err); res.send(err);});
                console.log("pics have been mangled!");
                res.send("resize successful!");
              
              }

              })();//end async
              
                // }
              }
          });
          console.log("returning image item : " + JSON.stringify(image));
      }
  });
});

async function getFilesRecursivelySub(param) { //function to get all keys from bucket, not just 1000
  // Call the function to get list of items from S3.
  let result = await s3.listObjectsV2(param).promise();

  if(!result.IsTruncated) { //i.e. < 1000
      // Recursive terminating condition.
      return result.Contents;
  } else {
      // Recurse it if results are truncated.
      param.ContinuationToken = result.NextContinuationToken;
      return result.Contents.concat(await getFilesRecursivelySub(param));
  }
}
app.get("/update_s3_picturepaths/:_id", function (req,res) {
  var params = {
    Bucket: process.env.ROOT_BUCKET_NAME,
    Prefix: 'users/' + req.params._id + '/'
  }
  getFilesRecursively();
  async function getFilesRecursively() {  
    let response = await getFilesRecursivelySub(params); //gimme all the things, even > 1000!
    let oKeys = [];
    let nKeys = [];
      response.forEach((elem) => { //no need to async?
          let keySplit = elem.Key.split("/");
          let filename = keySplit[keySplit.length - 1];
            if (((elem.Key.includes(".jpg") || elem.Key.includes(".png"))) && elem.Key.includes(".original.") && !elem.Key.includes("/pictures/originals/")) {
              oKeys = oKeys.concat(elem.Key);
              s3.headObject({Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + req.params._id + '/pictures/originals/' + filename}, function(err, data) { //where it should be
                if (err) { //object isn't in proper folder, copy it over
                console.log("need to copy " + filename);  
                s3.copyObject({CopySource: process.env.ROOT_BUCKET_NAME + '/' + elem.Key, Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + req.params._id + '/pictures/originals/' + filename }, function (err,data){
                    if (err) {
                      console.log("ERROR copyObject");
                      console.log(err);
                    }
                    else {
                      console.log('SUCCESS copyObject');
                    }
                  });
                } else {
                  console.log("found original, no need to copy" + filename);
                }
              });
            } else if (((elem.Key.includes(".jpg") || (elem.Key.includes(".png"))) && !elem.Key.includes("/pictures/originals/") && !elem.Key.includes(".original.") && !elem.Key.includes(".standard.") && !elem.Key.includes(".quarter.") && !elem.Key.includes(".half.") && !elem.Key.includes(".thumb."))) {
              s3.headObject({ Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + req.params._id + '/pictures/originals/' + filename }, function(err, data) { 
                if (err) { //object isn't in proper folder, copy it over
                    console.log("need to copy " + filename);
                    s3.copyObject({CopySource: process.env.ROOT_BUCKET_NAME + '/' + elem.Key, Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + req.params._id + '/pictures/originals/' + filename }, function (err,data){
                      if (err) {
                        console.log("ERROR copyObject");
                        console.log(err);
                      }
                      else {
                        console.log('SUCCESS copyObject');
                      }
                    });
                  } else {
                    console.log("found original, no need to copy" + filename);
                  }
                // oKeys = oKeys.concat(elem.Key);
              });
            } else if (((elem.Key.includes(".jpg") || (elem.Key.includes(".png"))) && !elem.Key.includes("/pictures/originals/") && !elem.Key.includes(".original.") && (elem.Key.includes(".standard.") || elem.Key.includes(".quarter.") || elem.Key.includes(".half.") || elem.Key.includes(".thumb.")))) {
              s3.headObject({ Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + req.params._id + '/pictures/' + filename }, function(err, data) { 
                if (err) { //object isn't in proper folder, copy it over
                    console.log("need to copy " + filename);
                    s3.copyObject({CopySource: process.env.ROOT_BUCKET_NAME + '/' + elem.Key, Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + req.params._id + '/pictures/' + filename }, function (err,data){
                      if (err) {
                        console.log("ERROR copyObject");
                        console.log(err);
                      }
                      else {
                        console.log('SUCCESS copyObject');
                      }
                    });
                  } else {
                    console.log("found previous, no need to copy" + filename);
                  }
                // oKeys = oKeys.concat(elem.Key);
              });
            }  else if (((elem.Key.includes(".png"))) && !elem.Key.includes("/pictures/originals/") && !elem.Key.includes(".original.")) { //these are the old waveform pngs, din't have no other identifires
              s3.headObject({ Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + req.params._id + '/pictures/' + filename }, function(err, data) { 
                if (err) { //object isn't in proper folder, copy it over
                    console.log("need to copy " + filename);
                    s3.copyObject({CopySource: process.env.ROOT_BUCKET_NAME + '/' + elem.Key, Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + req.params._id + '/pictures/' + filename }, function (err,data){
                      if (err) {
                        console.log("ERROR copyObject");
                        console.log(err);
                      }
                      else {
                        console.log('SUCCESS copyObject');
                      }
                    });
                  } else {
                    console.log("found previous, no need to copy" + filename);
                  }
                // oKeys = oKeys.concat(elem.Key);
              });
            }
          });
    res.send(oKeys);
  }
});

app.get("/update_s3_cubemappaths/:_id", function (req,res) {
    var params = {
      Bucket: 'archive1',
      Prefix: 'staging/' + req.params._id + '/cubemaps/'
    }
    getFilesRecursively();
    async function getFilesRecursively() {  
      let response = await getFilesRecursivelySub(params); //gimme all the things, even > 1000!
      let oKeys = [];
      let nKeys = [];
        response.forEach((elem) => { //no need to async?
            let keySplit = elem.Key.split("/");
            let filename = keySplit[keySplit.length - 1];
            s3.headObject({Bucket: 'servicemedia', Key: 'users/' + req.params._id + '/cubemaps/' + filename}, function(err, data) { //where it should be
              if (err) { //object isn't in proper folder, copy it over
              console.log("need to copy " + elem.Key);  
              s3.copyObject({CopySource: 'archive1' + '/' + elem.Key, Bucket: 'servicemedia', Key: 'users/' + req.params._id + '/cubemaps/' + filename }, function (err,data){
                  if (err) {
                    console.log("ERROR copyObject");
                    console.log(err);
                  }
                  else {
                    console.log('SUCCESS copyObject');
                  }
                });
              } else {
                console.log("found original, no need to copy" + filename);
              }
            });
            oKeys = oKeys.concat(filename);
            });
      res.send(oKeys);
    }
});
app.get("/update_s3_stagingpaths/:_id", function (req,res) {
  var params = {
    Bucket: 'archive1',
    Prefix: 'staging/' + req.params._id
  }
  getFilesRecursively();
  async function getFilesRecursively() {  
    let response = await getFilesRecursivelySub(params); //gimme all the things, even > 1000!
    let oKeys = [];
    let nKeys = [];
      response.forEach((elem) => { //no need to async?
          let keySplit = elem.Key.split("/");
          let filename = keySplit[keySplit.length - 1];
          if (!elem.Key.includes("cubemaps")) {
          s3.headObject({Bucket: 'servicemedia', Key: 'users/' + req.params._id + '/staging/' + filename}, function(err, data) { //where it should be
            if (err) { //object isn't in proper folder, copy it over
            console.log("need to copy " + elem.Key);  
            s3.copyObject({CopySource: 'archive1' + '/' + elem.Key, Bucket: 'servicemedia', Key: 'users/' + req.params._id + '/staging/' + filename }, function (err,data){
                if (err) {
                  console.log("ERROR copyObject");
                  console.log(err);
                }
                else {
                  console.log('SUCCESS copyObject');
                }
              });
            } else {
              console.log("found original, no need to copy" + filename);
            }
          });
          oKeys = oKeys.concat(filename);
          }  
        });
    res.send(oKeys);
  }
});


app.get("/update_s3_videopaths/:_id", function (req,res) {
  var params = {
    Bucket: process.env.ROOT_BUCKET_NAME,
    Prefix: 'users/' + req.params._id + '/'
  }
  getFilesRecursively();
  async function getFilesRecursively() {  
    let response = await getFilesRecursivelySub(params); //gimme all the things, even > 1000!
    let oKeys = [];
    let nKeys = [];
      response.forEach((elem) => { //no need to async?
          let keySplit = elem.Key.split("/");
          let filename = keySplit[keySplit.length - 1];
          let videoIDSplit = filename.split(".");
          let videoID = videoIDSplit[0]; 
          if (elem.Key.toLowerCase().includes(".mp4") || elem.Key.toLowerCase().includes(".mov") ||  elem.Key.toLowerCase().includes(".mkv") ||  elem.Key.toLowerCase().includes(".webm")) {
            s3.headObject({Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + req.params._id + '/video/'+videoID+'/' + filename}, function(err, data) { //where it should be
              if (err) { //object isn't in proper folder, copy it over
              console.log("need to copy " + filename + " " + videoID);  
              s3.copyObject({CopySource: process.env.ROOT_BUCKET_NAME + '/' + elem.Key, Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + req.params._id + '/video/'+videoID+'/' + filename }, function (err,data){
                  if (err) {
                    console.log("ERROR copyObject");
                    console.log(err);
                  }
                  else {
                    console.log('SUCCESS copyObject');
                  }
                });
              } else {
                console.log("found original, no need to copy" + filename);
              }
            });
            oKeys = oKeys.concat(filename);
          } 
          });
    res.send(oKeys);
  }
});

// app.get('/process_audio_download_old/:_id', cors(corsOptions), requiredAuthentication, function (req, res) { //download before processing, instead of streaming it
//   console.log("tryna process audio : " + req.params._id);
//   var o_id = ObjectID(req.params._id);
//   db.audio_items.findOne({"_id": o_id}, function(err, audio_item) {
//     if (err || !audio_item) {
//         console.log("error getting audio item: " + err);
//         callback("no audio in db");
//         res.send("no audio in db");
//     } else {
//       console.log(JSON.stringify(audio_item));
//       var params = {Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + audio_item.userID + '/audio/originals/' + audio_item._id + ".original." + audio_item.filename};
//       s3.headObject(params, function(err, data) { //where it should be
//         if (err) { //object isn't in proper folder, copy it over
//           console.log("dint find nothin at s3 like that...");
//         } else {
//           console.log("found original, mtryna download " + audio_item.filename);
//           let hasSentResponse = false;
//           (async () => {
//             // var params = {Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + audio_item.userID + '/audio/originals/' + audio_item._id + ".original." + audio_item.filename};
//             let downloadpath = '/Volumes/STUMP_FAT_B/stump/ztash/audio/'+ audio_item._id+'/';
//             let filename = audio_item._id +"."+ audio_item.filename;
//             // if (!fs.existsSync(downloadpath)){
//             //   console.log("creating directory " + downloadpath); 
//             await fs.promises.mkdir(downloadpath).then().catch({if (err){return}});
//             // }
//             // let savepath = downloadpath + 'output.m3u8';
//             // console.log("tryna save audio to " + savepath);
//                 // await fs.promises.mkdir(downloadpath).then().catch({if (err){return}});
//                 // let data = await s3.getObject(params).promise().then().catch({if (err){return}});
//                 // await fs.promises.writeFile(downloadpath + filename, data).then().catch({if (err){return}});
//             // let data = await s3.getObject(params).createReadStream();
//             await DownloadS3File(params, downloadpath + filename).then().catch({if (err){return}});
//             console.log("file downloaded " + downloadpath + filename);
//             ffmpeg(fs.createReadStream(downloadpath + filename))
//             .setFfmpegPath(ffmpeg_static)
            
//             .output(process.env.LOCAL_TEMP_FOLDER + 'tmp.png')            
//             .complexFilter(
//               [
//                   '[0:a]aformat=channel_layouts=mono,showwavespic=s=600x200'
//               ]
//             )
//             .outputOptions(['-vframes 1'])
//             // .format('png')

//             .output(process.env.LOCAL_TEMP_FOLDER + 'tmp.ogg')
//             .audioBitrate(192)
//             .audioCodec('libvorbis')
//             .format('ogg')

//             .output(process.env.LOCAL_TEMP_FOLDER + 'tmp.mp3')
//             .audioBitrate(192)
//             .audioCodec('libmp3lame')
//             .format('mp3')

//             .on('end', () => {
//                 console.log("done squeezin audio");
//                 s3.putObject({
//                   Bucket: process.env.ROOT_BUCKET_NAME,
//                   Key: "users/" + audio_item.userID + "/audio/" + audio_item._id +"."+path.parse(audio_item.filename).name + ".ogg",
//                   Body: fs.readFileSync(process.env.LOCAL_TEMP_FOLDER + 'tmp.ogg'),
//                   ContentType: 'audio/ogg'
//                   }, function (error, resp) {
//                     if (error) {
//                       console.log('error putting  pic' + error);
//                     } else {
//                       console.log('Successfully uploaded  ogg with response: ' + JSON.stringify(resp));
//                     }
//                 });
//                 s3.putObject({
//                   Bucket: process.env.ROOT_BUCKET_NAME,
//                   Key: "users/" + audio_item.userID + "/audio/" + audio_item._id +"."+path.parse(audio_item.filename).name + ".mp3",
//                   Body: fs.readFileSync(process.env.LOCAL_TEMP_FOLDER + 'tmp.mp3'),
//                   ContentType: 'audio/mp3'
//                   }, function (error, resp) {
//                     if (error) {
//                       console.log('error putting  pic' + error);
//                     } else {
//                       console.log('Successfully uploaded mp3 with response: ' + JSON.stringify(resp));
//                     }
//                 });
//                 s3.putObject({
//                   Bucket: process.env.ROOT_BUCKET_NAME,
//                   Key: "users/" + audio_item.userID + "/audio/" + audio_item._id +"."+path.parse(audio_item.filename).name + ".png",
//                   Body: fs.readFileSync(process.env.LOCAL_TEMP_FOLDER + 'tmp.png'),
//                   ContentType: 'image/png'
//                 }, function (error, resp) {
//                   if (error) {
//                     console.log('error putting  pic' + error);
//                   } else {
//                     console.log('Successfully uploaded png with response: ' + JSON.stringify(resp));
//                   }
//               });
//               res.send("processed and uploading..");
//             })
//             .on('error', err => {
//                 console.error(err);
//                 res.send("error! " + err);
//             })
//             .on('progress', function(info) {
//                 console.log('progress ' + JSON.stringify(info));
//                 // if (!hasSentResponse) {
//                 //   hasSentResponse = true;
                  
//                 // }
//             })
//             .run();
//         })();
//         }
//       });
//     }
//     });
// });


app.get('/process_audio_download/:_id', cors(corsOptions), requiredAuthentication, function (req, res) { //download before processing, instead of streaming it// combined minio/s3 version
  console.log("tryna process audio : " + req.params._id);
  var o_id = ObjectID(req.params._id);
  db.audio_items.findOne({"_id": o_id}, function(err, audio_item) {
    if (err || !audio_item) {
        console.log("error getting audio item: " + err);
        callback("no audio in db");
        res.send("no audio in db");
    } else {
      console.log(JSON.stringify(audio_item));
      var params = {Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + audio_item.userID + '/audio/originals/' + audio_item._id + ".original." + audio_item.filename};

          (async () => {
            let hasSentResponse = false;
            if (minioClient) {
              // let downloadpath = process.env.LOCAL_TEMP_FOLDER;
              // let filename = audio_item._id +"."+ audio_item.filename;
              // if (!fs.existsSync(downloadpath)){
              //   console.log("creating directory " + downloadpath); 
              // await fs.promises.mkdir(downloadpath).then().catch({if (err){return}});
              let key = 'users/' + audio_item.userID + '/audio/originals/' + audio_item._id + ".original." + audio_item.filename;
              let savedLocation = process.env.LOCAL_TEMP_FOLDER + audio_item.filename;
              await DownloadMinioFile(process.env.ROOT_BUCKET_NAME, key, savedLocation);
              ffmpeg(fs.createReadStream(savedLocation))
              .setFfmpegPath(ffmpeg_static)
              
              .output(process.env.LOCAL_TEMP_FOLDER + 'tmp.png')            
              .complexFilter(
                [
                    '[0:a]aformat=channel_layouts=mono,showwavespic=s=600x200'
                ]
              )
              .outputOptions(['-vframes 1'])
              // .format('png')

              .output(process.env.LOCAL_TEMP_FOLDER + 'tmp.ogg')
              .audioBitrate(192)
              .audioCodec('libvorbis')
              .format('ogg')

              .output(process.env.LOCAL_TEMP_FOLDER + 'tmp.mp3')
              .audioBitrate(192)
              .audioCodec('libmp3lame')
              .format('mp3')

              .on('end', () => {
                  console.log("done squeezin audio");
                  minioClient.putObject(process.env.ROOT_BUCKET_NAME, "users/" + audio_item.userID + "/audio/" + audio_item._id +"."+path.parse(audio_item.filename).name + ".ogg", fs.readFileSync(process.env.LOCAL_TEMP_FOLDER + 'tmp.ogg'), function(err, objInfo) {
                    if(err) {
                        console.log("minioerr: " + err) // err should be null
                    } else {
                        console.log("Success with ogg version", objInfo)
                    }
                  });

                  minioClient.putObject(process.env.ROOT_BUCKET_NAME, "users/" + audio_item.userID + "/audio/" + audio_item._id +"."+path.parse(audio_item.filename).name + ".mp3", fs.readFileSync(process.env.LOCAL_TEMP_FOLDER + 'tmp.mp3'), function(err, objInfo) {
                    if(err) {
                        console.log("minioerr: " + err) // err should be null
                    } else {
                        console.log("Success with mp3 version", objInfo)
                    }
                  });

                  minioClient.putObject(process.env.ROOT_BUCKET_NAME, "users/" + audio_item.userID + "/audio/" + audio_item._id +"."+path.parse(audio_item.filename).name + ".png", fs.readFileSync(process.env.LOCAL_TEMP_FOLDER + 'tmp.png'), function(err, objInfo) {
                    if(err) {
                        console.log("minioerr: " + err) // err should be null
                    } else {
                        console.log("Success with waveform png", objInfo)
                    }
                  });
                  res.send("processed and uploading..");
              })
              .on('error', err => {
                  console.error(err);
                  res.send("error! " + err);
              })
              .on('progress', function(info) {
                  console.log('progress ' + JSON.stringify(info));
                  if (!hasSentResponse) {
                    hasSentResponse = true;
                    // res.send("processing!");
                  }
              })
              // .on('end', function() {
              //   console.log('Finished processing');
              //   res.send("processing complete!");
              // })
              .run();

            } else { // !minio
              s3.headObject(params, function(err, data) { //where it should be
                if (err) { //object isn't in proper folder, copy it over
                  console.log("dint find nothin at s3 like that...");
                } else {
                  console.log("found original, mtryna download " + audio_item.filename);
                  hasSentResponse = false;
                }
              });
              // var params = {Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + audio_item.userID + '/audio/originals/' + audio_item._id + ".original." + audio_item.filename};
              let downloadpath = process.env.LOCAL_TEMP_FOLDER + audio_item._id;
              let filename = audio_item._id +"."+ audio_item.filename;
              // if (!fs.existsSync(downloadpath)){
              //   console.log("creating directory " + downloadpath); 
              await fs.promises.mkdir(downloadpath).then().catch({if (err){return}});
              // }
              // let savepath = downloadpath + 'output.m3u8';
              // console.log("tryna save audio to " + savepath);
                  // await fs.promises.mkdir(downloadpath).then().catch({if (err){return}});
                  // let data = await s3.getObject(params).promise().then().catch({if (err){return}});
                  // await fs.promises.writeFile(downloadpath + filename, data).then().catch({if (err){return}});
              // let data = await s3.getObject(params).createReadStream();
              await DownloadS3File(params, downloadpath + filename).then().catch({if (err){return}});
              console.log("file downloaded " + downloadpath + filename);
              ffmpeg(fs.createReadStream(downloadpath + filename))
              .setFfmpegPath(ffmpeg_static)
              
              .output(process.env.LOCAL_TEMP_FOLDER + audio_item._id + 'tmp.png')            
              .complexFilter(
                [
                    '[0:a]aformat=channel_layouts=mono,showwavespic=s=600x200'
                ]
              )
              .outputOptions(['-vframes 1'])
              // .format('png')

              .output(process.env.LOCAL_TEMP_FOLDER + audio_item._id + 'tmp.ogg')
              .audioBitrate(192)
              .audioCodec('libvorbis')
              .format('ogg')

              .output(process.env.LOCAL_TEMP_FOLDER + audio_item._id + 'tmp.mp3')
              .audioBitrate(192)
              .audioCodec('libmp3lame')
              .format('mp3')

              .on('end', () => {
                  console.log("done squeezin audio");
                  s3.putObject({
                    Bucket: process.env.ROOT_BUCKET_NAME,
                    Key: "users/" + audio_item.userID + "/audio/" + audio_item._id +"."+path.parse(audio_item.filename).name + ".ogg",
                    Body: fs.readFileSync(process.env.LOCAL_TEMP_FOLDER + audio_item._id + 'tmp.ogg'),
                    ContentType: 'audio/ogg'
                    }, function (error, resp) {
                      if (error) {
                        console.log('error putting  pic' + error);
                      } else {
                        console.log('Successfully uploaded  ogg with response: ' + JSON.stringify(resp));
                        fs.unlinkSync(process.env.LOCAL_TEMP_FOLDER + audio_item._id + 'tmp.ogg');
                      }
                  });
                  s3.putObject({
                    Bucket: process.env.ROOT_BUCKET_NAME,
                    Key: "users/" + audio_item.userID + "/audio/" + audio_item._id +"."+path.parse(audio_item.filename).name + ".mp3",
                    Body: fs.readFileSync(process.env.LOCAL_TEMP_FOLDER + audio_item._id + 'tmp.mp3'),
                    ContentType: 'audio/mp3'
                    }, function (error, resp) {
                      if (error) {
                        console.log('error putting  pic' + error);
                      } else {
                        console.log('Successfully uploaded mp3 with response: ' + JSON.stringify(resp));
                        fs.unlinkSync(process.env.LOCAL_TEMP_FOLDER + audio_item._id + 'tmp.mp3');
                      }
                  });
                  s3.putObject({
                    Bucket: process.env.ROOT_BUCKET_NAME,
                    Key: "users/" + audio_item.userID + "/audio/" + audio_item._id +"."+path.parse(audio_item.filename).name + ".png",
                    Body: fs.readFileSync(process.env.LOCAL_TEMP_FOLDER + audio_item._id + 'tmp.png'),
                    ContentType: 'image/png'
                  }, function (error, resp) {
                    if (error) {
                      console.log('error putting  pic' + error);
                    } else {
                      console.log('Successfully uploaded png with response: ' + JSON.stringify(resp));
                      fs.unlinkSync(process.env.LOCAL_TEMP_FOLDER + audio_item._id + 'tmp.png');
                    }
                });
                res.send("processed and uploading..");
              })
              .on('progress', progress => {
                // HERE IS THE CURRENT TIME
                // const time = parseInt(progress.timemark.replace(/:/g, ''));
          
                // AND HERE IS THE CALCULATION
                // const percent = (time / totalTime) * 100;
                    
                console.log("processing: " + progress.timemark);
              })
              .on('error', err => {
                  console.error(err);
                  res.send("error! " + err);
              })
              // .on('progress', function(info) {
              //     console.log('progress ' + JSON.stringify(info));
              //     if (!hasSentResponse) {
              //       hasSentResponse = true;
              //       res.send("processing!");
              //     }
              // })
              .run();
          } //!minio close
      })(); //async close
    }
    });
});

// app.get('/process_audio/:_id', cors(corsOptions), requiredAuthentication, function (req, res) { //deprecated for download version above, stream unstable for large files
//   console.log("tryna process audio : " + req.params._id);
//   var o_id = ObjectID(req.params._id);
//   db.audio_items.findOne({"_id": o_id}, function(err, audio_item) {
//     if (err || !audio_item) {
//         console.log("error getting audio item: " + err);
//         callback("no audio in db");
//         res.send("no audio in db");
//     } else {
//       console.log(JSON.stringify(audio_item));
//       s3.headObject({Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + audio_item.userID + '/audio/originals/' + audio_item._id + ".original." + audio_item.filename}, function(err, data) { //where it should be
//         if (err) { //object isn't in proper folder, copy it over
//           console.log("dint find no file at s3 like that...");
//         } else {
//           console.log("found original " + audio_item.filename);
//           let hasSentResponse = false;
//           (async () => {
//             var params = {Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + audio_item.userID + '/audio/originals/' + audio_item._id + ".original." + audio_item.filename};
//             let data = await s3.getObject(params).createReadStream();
//             ffmpeg(data)
            
//             .setFfmpegPath(ffmpeg_static)
            
//             .output(process.env.LOCAL_TEMP_FOLDER + 'tmp.png')            
//             .complexFilter(
//               [
//                   '[0:a]aformat=channel_layouts=mono,showwavespic=s=600x200'
//               ]
//             )
//             .outputOptions(['-vframes 1'])
//             // .format('png')

//             .output(process.env.LOCAL_TEMP_FOLDER + 'tmp.ogg')
//             //.audioBitrate(256)
//             .audioQuality(1)
//             .audioCodec('libvorbis')
//             .format('ogg')

//             .output(process.env.LOCAL_TEMP_FOLDER + 'tmp.mp3')
//             // .audioBitrate(256)
//             .audioQuality(1)
//             .audioCodec('libmp3lame')
//             .format('mp3')

//             .on('end', () => {
//                 console.log("done squeezin audio");
//                 s3.putObject({
//                   Bucket: process.env.ROOT_BUCKET_NAME,
//                   Key: "users/" + audio_item.userID + "/audio/" + audio_item._id +"."+path.parse(audio_item.filename).name + ".ogg",
//                   Body: fs.readFileSync(process.env.LOCAL_TEMP_FOLDER + 'tmp.ogg'),
//                   ContentType: 'audio/ogg'
//                 }, function (error, resp) {
//                   if (error) {
//                     console.log('error putting  pic' + error);
//                   } else {
//                     console.log('Successfully uploaded  ogg with response: ' + JSON.stringify(resp));
//                   }
//               });
//                 s3.putObject({
//                   Bucket: process.env.ROOT_BUCKET_NAME,
//                   Key: "users/" + audio_item.userID + "/audio/" + audio_item._id +"."+path.parse(audio_item.filename).name + ".mp3",
//                   Body: fs.readFileSync(process.env.LOCAL_TEMP_FOLDER + 'tmp.mp3'),
//                   ContentType: 'audio/mp3'
//                 }, function (error, resp) {
//                   if (error) {
//                     console.log('error putting  pic' + error);
//                   } else {
//                     console.log('Successfully uploaded mp3 with response: ' + JSON.stringify(resp));
//                   }
//               });
//                 s3.putObject({
//                   Bucket: process.env.ROOT_BUCKET_NAME,
//                   Key: "users/" + audio_item.userID + "/audio/" + audio_item._id +"."+path.parse(audio_item.filename).name + ".png",
//                   Body: fs.readFileSync(process.env.LOCAL_TEMP_FOLDER + 'tmp.png'),
//                   ContentType: 'image/png'
//                 }, function (error, resp) {
//                   if (error) {
//                     console.log('error putting  pic' + error);
//                   } else {
//                     console.log('Successfully uploaded png with response: ' + JSON.stringify(resp));
//                   }
//               });
//               })
//             .on('error', err => {
//                 console.error(err);
//                 res.send("error! " + err);
//             })
//             .on('progress', function(info) {
//                 console.log('progress ' + JSON.stringify(info));
//                 // if (!hasSentResponse) {
//                 //   hasSentResponse = true;
//                 //   res.send("processing!");
//                 // }
//             })
//             .run();
//         })();
//         }
//       });
//     }
//     });
// });


function DownloadS3File (params, location) {

  return new Promise((resolve, reject) => { //return promise so can await below
    // const destPath = `/tmp/${path.basename(key)}`
    // const params = { Bucket: 'EXAMPLE', Key: key }
    // if (!fs.stat(location)) {
    // fs.mkdir(location);
    // } 
    const s3Stream = s3.getObject(params).createReadStream();
    const fileStream = fs.createWriteStream(location);
    s3Stream.on('error', reject);
    fileStream.on('error', reject);
    s3Stream.on('progress', () => {
      console.log("download progress: " + progress);
    })
    fileStream.on('close', () => { 
      resolve(location);
      console.log("filestream closed writiing to " + location);
    });
    s3Stream.pipe(fileStream);
  });
}
function DownloadMinioFile (bucket, key, location) {

  return new Promise((resolve, reject) => { //return promise so can await below
    const minioStream = minioClient.getObject(bucket, key);
    const fileStream = fs.createWriteStream(location);
    let buffer = []
    let size = 0;
    minioClient.getObject(bucket, key, function(err, dataStream) {
      if (err) {
        // return 
        console.log(err);
        
      }
      dataStream.on('data', function(chunk) {
        size += chunk.length
        buffer.push(chunk);
        // chunk.pipe(fileStream);
      })
      dataStream.on('end', function() {
        console.log('End. Total size = ' + size)
        // return data
        fs.writeFile(location, Buffer.concat(buffer), err => {
          if (err) {
            console.error(err);
          }
          console.log("file written to locaiton :" + location);
          resolve(location);
      });
        
      })
      dataStream.on('error', function(err) {
        console.log(err);
        reject(err);
      })
    });
    // // const fileStream = fs.createWriteStream(location);
    // // minioStream.on('error', reject);
    // fileStream.on('error', reject);
    // minioStream.pipe(fileStream);
    // // s3Stream.on('progress', )
    // fileStream.on('close', () => { 
    //   resolve(location);
    //   console.log("filestream closed writiing to " + location);
    // });

  });
}


app.get('/process_video_hls/:_id', cors(corsOptions), requiredAuthentication, function (req, res) {
  console.log("tryna process video : " + req.params._id);
  var o_id = ObjectID(req.params._id);
  db.video_items.findOne({"_id": o_id}, function(err, video_item) {
    if (err || !video_item) {
        console.log("error getting image item: " + err);
        callback("no image in db");
        res.send("no image in db");
    } else {
      console.log(JSON.stringify(video_item));
      let hasSentResponse = false;
      (async () => {

        if (minioClient) {

          let downloadpath = process.env.LOCAL_TEMP_FOLDER+ video_item._id+'/';
          let filename = video_item._id +"."+ video_item.filename;
            if (!fs.existsSync(downloadpath)){
              fs.mkdirSync(downloadpath);
          }
          let savepath = downloadpath + 'output.m3u8';

          let key = 'users/' + video_item.userID + '/video/' + video_item._id + "/" + video_item._id +"."+ video_item.filename;
          let savedLocation = downloadpath + filename;
          await DownloadMinioFile(process.env.ROOT_BUCKET_NAME, key, savedLocation);

          ffmpeg(downloadpath + filename)
          .setFfmpegPath(ffmpeg_static)
            
            // var proc = ffmpeg('rtmp://path/to/live/stream', { timeout: 432000 })
            .output(savepath)
            .outputOptions([
              // '-codec: copy',
              '-hls_time 5',
              '-hls_list_size 0',
              '-hls_playlist_type vod',
              // '-hls_base_url http://localhost:8080/',
              '-hls_segment_filename '+ downloadpath +'%03d.ts'
            ])
            // set video bitrate
            .videoBitrate(1000)
            // set h264 preset
            // .addOption('preset','superfast')
            // set target codec
            .videoCodec('libx264')
            // set audio bitrate
            // .audioCodec('libfdk_aac')
            .audioBitrate('128k')
            // set audio codec
            // .audioCodec('libmp3lame')
            // set number of audio channels
            .audioChannels(2)
            .withSize('720x480')
            // set hls segments time
            // .addOption('-hls_time', 10)
            // // include all the segments in the list
            // .addOption('-hls_list_size',0)
            // setup event handlers
            .on('end', () => {
                console.log("done squeezin video");
                try {
                  fs.unlinkSync(downloadpath + filename);
                  console.log("deleting original file");
                  //file removed
                } catch(err) {
                  console.error(err)
                }
                fs.readdir(downloadpath, (err, files) => {
                  if (err != null) {
                    console.log("error reading directory " + err);
                  } else {
                    files.forEach(file => {
                        console.log(file);
                        if (path.extname(file) == '.ts') {
                          minioClient.putObject(process.env.ROOT_BUCKET_NAME, "users/" + video_item.userID + "/video/" + video_item._id +"/hls/" + file, fs.readFileSync(downloadpath + file), function(err, objInfo) {
                            if(err) {
                                console.log("minioerr: " + err) // err should be null
                            } else {
                                console.log("Success with .ts file", objInfo)
                            }
                          });
        
                          // s3.putObject({
                          //   Bucket: process.env.ROOT_BUCKET_NAME,
                          //   Key: "users/" + video_item.userID + "/video/" + video_item._id +"/hls/" + file,
                          //   Body: fs.readFileSync(downloadpath + file),
                          //   ContentType: 'video/MP2T'
                          //   }, function (error, resp) {
                          //     if (error) {
                          //       console.log('error putting  pic' + error);
                          //     } else {
                          //       console.log('Successfully uploaded ts file with response: ' + JSON.stringify(resp));
                          //     }
                          // });
                        } else if (path.extname(file) == '.m3u8') {
                          minioClient.putObject(process.env.ROOT_BUCKET_NAME, "users/" + video_item.userID + "/video/" + video_item._id +"/hls/" + file, fs.readFileSync(downloadpath + file), function(err, objInfo) {
                            if(err) {
                                console.log("minioerr: " + err) // err should be null
                            } else {
                                console.log("Success with m3u8 file", objInfo)
                            }
                          });
        
                          // s3.putObject({
                          //   Bucket: process.env.ROOT_BUCKET_NAME,
                          //   Key: "users/" + video_item.userID + "/video/" + video_item._id +"/hls/" + file,
                          //   Body: fs.readFileSync(downloadpath + file),
                          //   ContentType: 'application/x-mpegURL'
                          //   }, function (error, resp) {
                          //     if (error) {
                          //       console.log('error putting  pic' + error);
                          //     } else {
                          //       console.log('Successfully uploaded m3u8 response: ' + JSON.stringify(resp));
                          //     }
                          // });
                      }
                    });
                  }
                });
              //   s3.putObject({
              //     Bucket: process.env.ROOT_BUCKET_NAME,
              //     Key: "users/" + video_item.userID + "/video/" + video_item._id +"/hls/" + video_item._id +"."+path.parse(video_item.filename).name + ".ogg",
              //     Body: fs.readFileSync('tmp.m3u8'),
              //     ContentType: 'application/x-mpegURL'
              //   }, function (error, resp) {
              //     if (error) {
              //       console.log('error putting  pic' + error);
              //     } else {
              //       console.log('Successfully uploaded  video with response: ' + JSON.stringify(resp));
              //     }
              // });
            })
            .on('error', err => {
                console.error("err: " + err);
                res.send("error! " + err);
            })
            .on('progress', function(info) {
                console.log('progress ' + JSON.stringify(info));
                // if (!hasSentResponse) {
                //   hasSentResponse = true;
                //   res.send("processing");
                // }
            })
            .run();

        } else {
          s3.headObject({Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + video_item.userID + '/video/' + video_item._id + "/" + video_item._id +"."+ video_item.filename}, function(err, data) { //where it should be
          if (err) { 
            console.log("dint find no file at s3 like " + 'users/' + video_item.userID + '/video/' + video_item._id + "/" + video_item._id +"."+ video_item.filename);
          } else {
            console.log("found original " + process.env.ROOT_BUCKET_NAME + 'users/' + video_item.userID +'/video/' + video_item._id + "/" + video_item._id +"."+video_item.filename);
            hasSentResponse = false;
          }
          });

            var params = {Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + video_item.userID +'/video/' + video_item._id + "/" + video_item._id +"."+ video_item.filename};
            let downloadpath = process.env.LOCAL_TEMP_FOLDER+ video_item._id+'/';
            let filename = video_item._id +"."+ video_item.filename;
              if (!fs.existsSync(downloadpath)){
                fs.mkdirSync(downloadpath);
            }
            let savepath = downloadpath + 'output.m3u8';
            console.log("tryna save hls to " + savepath);
            // let data = await s3.getObject(params).promise().then().catch({if (err){return}});
            // await fs.writeFile(downloadpath, data).promise().then().catch({if (err){return}});
            // let data = await s3.getObject(params).createReadStream();
            // await DownloadS3File(params, downloadpath + filename);
            await DownloadS3File(params, downloadpath + filename).then().catch({if (err){return}});
            ffmpeg(downloadpath + filename)
            .setFfmpegPath(ffmpeg_static)
            
            // var proc = ffmpeg('rtmp://path/to/live/stream', { timeout: 432000 })
            .output(savepath)
            .outputOptions([
              // '-codec: copy',
              '-hls_time 5',
              '-hls_list_size 0',
              '-hls_playlist_type vod',
              // '-hls_base_url http://localhost:8080/',
              '-hls_segment_filename '+ downloadpath +'%03d.ts'
            ])
            // set video bitrate
            .videoBitrate(1000)
            // set h264 preset
            // .addOption('preset','superfast')
            // set target codec
            .videoCodec('libx264')
            // set audio bitrate
            // .audioCodec('libfdk_aac')
            .audioBitrate('128k')
            // set audio codec
            // .audioCodec('libmp3lame')
            // set number of audio channels
            .audioChannels(2)
            .withSize('720x480')
            // set hls segments time
            // .addOption('-hls_time', 10)
            // // include all the segments in the list
            // .addOption('-hls_list_size',0)
            // setup event handlers
            .on('end', () => {
                console.log("done squeezin video");
                try {
                  fs.unlinkSync(downloadpath + filename);
                  console.log("deleting original file");
                  //file removed
                } catch(err) {
                  console.error(err)
                }
                fs.readdir(downloadpath, (err, files) => {
                  if (err != null) {
                    console.log("error reading directory " + err);
                  } else {
                    files.forEach(file => {
                        console.log(file);
                        if (path.extname(file) == '.ts') {
                          s3.putObject({
                            Bucket: process.env.ROOT_BUCKET_NAME,
                            Key: "users/" + video_item.userID + "/video/" + video_item._id +"/hls/" + file,
                            Body: fs.readFileSync(downloadpath + file),
                            ContentType: 'video/MP2T'
                            }, function (error, resp) {
                              if (error) {
                                console.log('error putting  pic' + error);
                              } else {
                                console.log('Successfully uploaded ts file with response: ' + JSON.stringify(resp));
                              }
                          });
                        } else if (path.extname(file) == '.m3u8') {
                          s3.putObject({
                            Bucket: process.env.ROOT_BUCKET_NAME,
                            Key: "users/" + video_item.userID + "/video/" + video_item._id +"/hls/" + file,
                            Body: fs.readFileSync(downloadpath + file),
                            ContentType: 'application/x-mpegURL'
                            }, function (error, resp) {
                              if (error) {
                                console.log('error putting  pic' + error);
                              } else {
                                console.log('Successfully uploaded m3u8 response: ' + JSON.stringify(resp));
                              }
                          });
                      }
                    });
                  }
                });
              //   s3.putObject({
              //     Bucket: process.env.ROOT_BUCKET_NAME,
              //     Key: "users/" + video_item.userID + "/video/" + video_item._id +"/hls/" + video_item._id +"."+path.parse(video_item.filename).name + ".ogg",
              //     Body: fs.readFileSync('tmp.m3u8'),
              //     ContentType: 'application/x-mpegURL'
              //   }, function (error, resp) {
              //     if (error) {
              //       console.log('error putting  pic' + error);
              //     } else {
              //       console.log('Successfully uploaded  video with response: ' + JSON.stringify(resp));
              //     }
              // });
            })
            .on('error', err => {
                console.error("err: " + err);
                res.send("error! " + err);
            })
            .on('progress', function(info) {
                console.log('progress ' + JSON.stringify(info));
                // if (!hasSentResponse) {
                //   hasSentResponse = true;
                //   res.send("processing");
                // }
            })
            .run();
          }
        //   }
        // });
      })(); //end async
    }
    });
});


app.get('/process_video_hls_old/:_id', cors(corsOptions), requiredAuthentication, function (req, res) {
  console.log("tryna process video : " + req.params._id);
  var o_id = ObjectID(req.params._id);
  db.video_items.findOne({"_id": o_id}, function(err, video_item) {
    if (err || !video_item) {
        console.log("error getting image item: " + err);
        callback("no image in db");
        res.send("no image in db");
    } else {
      console.log(JSON.stringify(video_item));
      
      s3.headObject({Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + video_item.userID + '/video/' + video_item._id + "/" + video_item._id +"."+ video_item.filename}, function(err, data) { //where it should be
        if (err) { 
          console.log("dint find no file at s3 like " + 'users/' + video_item.userID + '/video/' + video_item._id + "/" + video_item._id +"."+ video_item.filename);
        } else {
          console.log("found original " + process.env.ROOT_BUCKET_NAME + 'users/' + video_item.userID +'/video/' + video_item._id + "/" + video_item._id +"."+video_item.filename);
          let hasSentResponse = false;
          (async () => {
            var params = {Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + video_item.userID +'/video/' + video_item._id + "/" + video_item._id +"."+ video_item.filename};
            let downloadpath = '/Volumes/STUMP_FAT_B/stump/video/'+ video_item._id+'/';
            let filename = video_item._id +"."+ video_item.filename;
              if (!fs.existsSync(downloadpath)){
                fs.mkdirSync(downloadpath);
            }
            let savepath = downloadpath + 'output.m3u8';
            console.log("tryna save hls to " + savepath);
            // let data = await s3.getObject(params).promise().then().catch({if (err){return}});
            // await fs.writeFile(downloadpath, data).promise().then().catch({if (err){return}});
            // let data = await s3.getObject(params).createReadStream();
            await DownloadS3File(params, downloadpath + filename);

            ffmpeg(downloadpath + filename)
            .setFfmpegPath(ffmpeg_static)
            
            // var proc = ffmpeg('rtmp://path/to/live/stream', { timeout: 432000 })
            .output(savepath)
            .outputOptions([
              // '-codec: copy',
              '-hls_time 5',
              '-hls_list_size 0',
              '-hls_playlist_type vod',
              // '-hls_base_url http://localhost:8080/',
              '-hls_segment_filename '+ downloadpath +'%03d.ts'
            ])
            // set video bitrate
            .videoBitrate(1000)
            // set h264 preset
            // .addOption('preset','superfast')
            // set target codec
            .videoCodec('libx264')
            // set audio bitrate
            // .audioCodec('libfdk_aac')
            .audioBitrate('128k')
            // set audio codec
            // .audioCodec('libmp3lame')
            // set number of audio channels
            .audioChannels(2)
            .withSize('720x480')
            // set hls segments time
            // .addOption('-hls_time', 10)
            // // include all the segments in the list
            // .addOption('-hls_list_size',0)
            // setup event handlers
            .on('end', () => {
                console.log("done squeezin video");
                try {
                  fs.unlinkSync(downloadpath + filename);
                  console.log("deleting original file");
                  //file removed
                } catch(err) {
                  console.error(err)
                }
                fs.readdir(downloadpath, (err, files) => {
                  if (err != null) {
                    console.log("error reading directory " + err);
                  } else {
                    files.forEach(file => {
                        console.log(file);
                        if (path.extname(file) == '.ts') {
                          s3.putObject({
                            Bucket: process.env.ROOT_BUCKET_NAME,
                            Key: "users/" + video_item.userID + "/video/" + video_item._id +"/hls/" + file,
                            Body: fs.readFileSync(downloadpath + file),
                            ContentType: 'video/MP2T'
                            }, function (error, resp) {
                              if (error) {
                                console.log('error putting  pic' + error);
                              } else {
                                console.log('Successfully uploaded ts file with response: ' + JSON.stringify(resp));
                              }
                          });
                        } else if (path.extname(file) == '.m3u8') {
                          s3.putObject({
                            Bucket: process.env.ROOT_BUCKET_NAME,
                            Key: "users/" + video_item.userID + "/video/" + video_item._id +"/hls/" + file,
                            Body: fs.readFileSync(downloadpath + file),
                            ContentType: 'application/x-mpegURL'
                            }, function (error, resp) {
                              if (error) {
                                console.log('error putting  pic' + error);
                              } else {
                                console.log('Successfully uploaded m3u8 response: ' + JSON.stringify(resp));
                              }
                          });
                      }
                    });
                  }
                });
              //   s3.putObject({
              //     Bucket: process.env.ROOT_BUCKET_NAME,
              //     Key: "users/" + video_item.userID + "/video/" + video_item._id +"/hls/" + video_item._id +"."+path.parse(video_item.filename).name + ".ogg",
              //     Body: fs.readFileSync('tmp.m3u8'),
              //     ContentType: 'application/x-mpegURL'
              //   }, function (error, resp) {
              //     if (error) {
              //       console.log('error putting  pic' + error);
              //     } else {
              //       console.log('Successfully uploaded  video with response: ' + JSON.stringify(resp));
              //     }
              // });
            })
            .on('error', err => {
                console.error("err: " + err);
                res.send("error! " + err);
            })
            .on('progress', function(info) {
                console.log('progress ' + JSON.stringify(info));
                // if (!hasSentResponse) {
                //   hasSentResponse = true;
                //   res.send("processing");
                // }
            })
            .run();
        })();
        }
      });
    }
    });
});

app.get('/process_audio_hls/:_id', cors(corsOptions), requiredAuthentication, function (req, res) {
  console.log("tryna process video : " + req.params._id);
  var o_id = ObjectID(req.params._id);
  db.audio_items.findOne({"_id": o_id}, function(err, audio_item) {
    if (err || !audio_item) {
        console.log("error getting image item: " + err);
        callback("no image in db");
        res.send("no image in db");
    } else {
      console.log(JSON.stringify(audio_item));
      s3.headObject({Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + audio_item.userID + '/audio/' + audio_item._id + "/" + audio_item._id +"."+ audio_item.filename}, function(err, data) { //where it should be
        if (err) { 
          console.log("dint find no file at s3 like " + 'users/' + audio_item.userID + '/audio/' + audio_item._id + "/" + audio_item._id +"."+ audio_item.filename);
        } else {
          console.log("found original " + process.env.ROOT_BUCKET_NAME + 'users/' + audio_item.userID +'/audio/' + audio_item._id + "/" + audio_item._id +"."+audio_item.filename);
          let hasSentResponse = false;
          (async () => {
            var params = {Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + audio_item.userID +'/audio/' + audio_item._id + "/" + audio_item._id +"."+ audio_item.filename};
            let downloadpath = '/Volumes/SM_FAT2/grabandsqueeze/audio/'+ audio_item._id+'/';
            let filename = audio_item._id +"."+ audio_item.filename;
            if (!fs.existsSync(downloadpath)){
              fs.mkdirSync(downloadpath);
          }
            let savepath = downloadpath + 'output.m3u8';
            console.log("tryna save hls to " + savepath);
            // let data = await s3.getObject(params).promise().then().catch({if (err){return}});
            // await fs.writeFile(downloadpath, data).promise().then().catch({if (err){return}});
            // let data = await s3.getObject(params).createReadStream();
            await DownloadS3File(params, downloadpath + filename);

            ffmpeg(downloadpath + filename)
            .setFfmpegPath(ffmpeg_static)
            
            // var proc = ffmpeg('rtmp://path/to/live/stream', { timeout: 432000 })
            .output(savepath)
            .outputOptions([
              // '-codec: copy',
              '-hls_time 5',
              '-hls_list_size 0',
              '-hls_playlist_type vod',
              // '-hls_base_url http://localhost:8080/',
              '-hls_segment_filename '+ downloadpath +'%03d.ts'
            ])
            // set video bitrate
            .videoBitrate(1500)
            // set h264 preset
            // .addOption('preset','superfast')
            // set target codec
            .videoCodec('libx264')
            // set audio bitrate
            // .audioCodec('libfdk_aac')
            .audioBitrate('128k')
            // set audio codec
            // .audioCodec('libmp3lame')
            // set number of audio channels
            .audioChannels(2)
            .withSize('1280x720')
            // set hls segments time
            // .addOption('-hls_time', 10)
            // // include all the segments in the list
            // .addOption('-hls_list_size',0)
            // setup event handlers
            .on('end', () => {
                console.log("done squeezin video");
                try {
                  fs.unlinkSync(downloadpath + filename);
                  console.log("deleting original file");
                  //file removed
                } catch(err) {
                  console.error(err)
                }
                fs.readdir(downloadpath, (err, files) => {
                  if (err != null) {
                    console.log("error reading directory " + err);
                  } else {
                    files.forEach(file => {
                        console.log(file);
                        if (path.extname(file) == '.ts') {
                          s3.putObject({
                            Bucket: process.env.ROOT_BUCKET_NAME,
                            Key: "users/" + audio_item.userID + "/audio/" + audio_item._id +"/hls/" + file,
                            Body: fs.readFileSync(downloadpath + file),
                            ContentType: 'video/MP2T'
                            }, function (error, resp) {
                              if (error) {
                                console.log('error putting  pic' + error);
                              } else {
                                console.log('Successfully uploaded ts file with response: ' + JSON.stringify(resp));
                              }
                          });
                        } else if (path.extname(file) == '.m3u8') {
                          s3.putObject({
                            Bucket: process.env.ROOT_BUCKET_NAME,
                            Key: "users/" + audio_item.userID + "/audio/" + audio_item._id +"/hls/" + file,
                            Body: fs.readFileSync(downloadpath + file),
                            ContentType: 'application/x-mpegURL'
                            }, function (error, resp) {
                              if (error) {
                                console.log('error putting  pic' + error);
                              } else {
                                console.log('Successfully uploaded m3u8 response: ' + JSON.stringify(resp));
                              }
                          });
                      }
                    });
                  }
                });
              //   s3.putObject({
              //     Bucket: process.env.ROOT_BUCKET_NAME,
              //     Key: "users/" + video_item.userID + "/video/" + video_item._id +"/hls/" + video_item._id +"."+path.parse(video_item.filename).name + ".ogg",
              //     Body: fs.readFileSync('tmp.m3u8'),
              //     ContentType: 'application/x-mpegURL'
              //   }, function (error, resp) {
              //     if (error) {
              //       console.log('error putting  pic' + error);
              //     } else {
              //       console.log('Successfully uploaded  video with response: ' + JSON.stringify(resp));
              //     }
              // });
            })
            .on('error', err => {
                console.error("err: " + err);
                res.send("error! " + err);
            })
            .on('progress', function(info) {
                console.log('progress ' + JSON.stringify(info));
                // if (!hasSentResponse) {
                //   hasSentResponse = true;
                //   res.send("processing");
                // }
            })
            .run();
        })();
        }
      });
    }
    });
});
// app.get("/stream_vid/", cors(corsOptions), requiredAuthentication, function (req, res) {
//     //send "Hello World" to the client as html
//     // console.log("trina scrape...");
//     // let url = "/practikorkus_20191210.mp3";
//     console.log(ffmpeg_static);
//     // let stream = http.get('http://kork.us.s3.amazonaws.com/audio/practikorkus_20191210.mp3');
//     // let file = fs.createWriteStream("tmp.ogg");
//     // http.get("http://kork.us.s3.amazonaws.com/audio/practikorkus_20191210.mp3", res => {
//     //     res.pipe(file);
//     //     let data = "";

//     //     res.on("data", d => {
//     //         data += d;
//     //     });
//     //     res.on("end", () => {
//     //         console.log("done");
//     //     });
//     // });
//     (async () => {
//         // var host = '192.168.1.160';
//         // var port = '1935';
//         // var path = '/live/test';
        
//     //     ffmpeg('rtmp://'+host+':'+port+path, { timeout: 432000 }).addOptions([
//     //         '-c:v libx264',
//     //         '-c:a aac',
//     //         '-ac 1',
//     //         '-strict -2',
//     //         '-crf 18',
//     //         '-profile:v baseline',
//     //         '-maxrate 400k',
//     //         '-bufsize 1835k',
//     //         '-pix_fmt yuv420p',
//     //         '-hls_time 10',
//     //         '-hls_list_size 6',
//     //         '-hls_wrap 10',
//     //         '-start_number 1'
//     //       ]).output('public/videos/output.m3u8').on('end', () => {
//     //         // ...
//     //         console.log("done squeezin vidz");
//     //     //   })
//     //     })
//     //     
//         let path = ffmpeg_static;
//         var proc = ffmpeg('rtmp://192.168.1.160:1935/live/test', { timeout: 432000 })
//         .setFfmpegPath(path)
//         // set video bitrate
//         .videoBitrate(1024)
//         // set h264 preset
//         // .addOption('preset','superfast')
//         // set target codec
//         .videoCodec('libx264')
//         // set audio bitrate
//         .audioBitrate('128k')
//         // set audio codec
//         .withAudioCodec('aac')

//         .format('mp4')
//         // set number of audio channels
//         .audioChannels(2)
//         // set hls segments time
//         .addOption('-hls_time', 10)
//         // include all the segments in the list
//         .addOption('-hls_list_size',0)
//         // .on('progress', function(prog) {
//         //     console.log(prog);
//         // })
//         // setup event handlers
//         .on('end', function() {
//             console.log('file has been converted succesfully');
//         })
//         .on('error', function(err) {
//             console.log('an error happened: ' + err.message);
//         })
//         // save to file
//         .save('public/videos/output.m3u8');

//         // proc = proc
//         // proc.setFfmpegPath(ffmpeg_static);
//         })();
// });