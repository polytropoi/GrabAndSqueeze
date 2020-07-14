//copyright 2020 servicemedia.net
var express = require("express")
    , https = require('https')
    , ffmpeg = require('fluent-ffmpeg')
    , ffmpeg_static = require('ffmpeg-static')
    , puppeteer = require('puppeteer')
    , sharp = require('sharp') 
    , http = require("http")
    , jwt = require("jsonwebtoken")
    , path = require("path")
    , http = require("http")
    , fs = require("fs")
    , bodyParser = require('body-parser')
    , mongojs = require("mongojs")
    , helmet = require('helmet')
    , ObjectID = require("bson-objectid")

    app = express();
    app.use(helmet()); //sets a bunch of security headers
    // app.use(helmet.frameguard());
    require('dotenv').config();

var rootHost = process.env.ROOT_HOST
var appName = "ServiceMedia";
var topName = process.env.ROOT_NAME;
var requirePayment = true; //if subscription is required to login, true for servicemedia

var adminEmail = process.env.ADMIN_EMAIL;

var domainAdminEmail = process.env.DOMAIN_ADMIN_EMAIL;


var whitelist = ['https://servicemedia.net', 'http://localhost:4000'];

var oneDay = 86400000;

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

var databaseUrl = process.env.MONGO_URL; 

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

    // app.use(methodOverride());
//    var sessionStore = new session.MemoryStore();
    var expiryDate = new Date(Date.now() + 60 * 60 * 1000) // 2 hour

    app.use(bodyParser.json({ "limit": "10mb", extended: true }));
    app.use(bodyParser.urlencoded({ extended: false }));


var maxItems = 1000;

var aws = require('aws-sdk');
const { lookupService } = require("dns");
const { callbackify } = require("util");
aws.config.loadFromPath('conf.json');
var ses = new aws.SES({apiVersion : '2010-12-01'});
var s3 = new aws.S3();

var appAuth = "noauth";

var server = http.createServer(app);
server.timeout = 240000;
server.keepAliveTimeout = 24000;
server.listen(process.env.PORT || 4000, function(){
    console.log("Express server listening on port 4000");
});

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
          req.session.error = 'Access denied!';
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


  async function getObject (bucket, objectKey) {
    try {
      const params = {
        Bucket: bucket,
        Key: objectKey 
      }
  
      const data = await s3.getObject(params).promise();
  
      return data.Body;
    } catch (e) {
      throw new Error(`Could not retrieve file from S3: ${e.message}`)
    }
  }
  async function putObject (bucket, objectKey, data) {
    try {
      const params = {
        Bucket: bucket,
        Key: objectKey,
        Body: data 
      }
  
      const data = await s3.putObject(params).promise();
  
      return data.Body;
    } catch (e) {
      throw new Error(`Could not retrieve file from S3: ${e.message}`)
    }
  }

function getExtension(filename) {
    // console.log("tryna get extension of " + filename);
    var i = filename.lastIndexOf('.');
    return (i < 0) ? '' : filename.substr(i);
}





app.get("/", function (req, res) {
    //send "Hello World" to the client as html
        res.send("howdy!");
});

app.get("/scrape_webpage/:pageurl", function (req, res) {
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

app.post("/scrape_webpage/", function (req, res) {
    if (validURL(req.body.pageurl)) {
    let url = req.body.pageurl;
    (async () => {
        console.log("trina scrape...");
        let response = "";
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        const override = Object.assign(page.viewport(), {width: 1024, height: 1024});
        await page.setViewport(override);
        await page.goto(url);
        const pagepic = await page.screenshot({fullPage: true});
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
            res.send(response);
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
            res.send(response);
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
    } else {
        res.send("invalid url");
    }
});

app.get('/resize_uploaded_picture/:_id', requiredAuthentication, function (req, res) {
    console.log("tryna resize pic with key: " + req.params._id);
    var o_id = ObjectID(req.params._id);
    db.image_items.findOne({"_id": o_id}, function(err, image) {
        if (err || !image) {
            console.log("error getting image item: " + err);
            callback("no image in db");
            res.send("no image in db");
        } else {
            var params = {Bucket: 'servicemedia', Key: "users/" + image.userID + "/pictures/originals/" + image._id +".original."+image.filename};
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
                    if (err) {
                        console.log(err);
                        res.end("couldn't get no image data");
                    } else {
                        (async () => { //do these jerbs one at a time..
                        let data = await s3.getObject(params).promise();
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
                                Bucket: 'servicemedia',
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
                        .catch(err => {console.log(err); res.end(err);});
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
                                Bucket: 'servicemedia',
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
                        .catch(err => {console.log(err); res.end(err);});
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
                                Bucket: 'servicemedia',
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
                        .catch(err => {console.log(err); res.end(err);});
                        res.send("resize successful!");
                        })();//end async
                        }
                    // })();//end async
                    // });
                }
            });
            console.log("returning image item : " + JSON.stringify(image));
        }
    });
});

async function allBucketKeys(s3, params) {
  // const params = {
  //   Bucket: bucket,
  // };

  var keys = [];
  for (;;) {
    var data = await s3.listObjects(params).promise();

    data.Contents.forEach((elem) => {
      keys = keys.concat(elem.Key);
    });

    if (!data.IsTruncated) {
      break;
    }
    params.Marker = data.NextMarker;
  }

  return keys;
}
async function getFilesRecursivelySub(param) {

  // Call the function to get list of items from S3.
  let result = await s3.listObjectsV2(param).promise();

  if(!result.IsTruncated) {
      // Recursive terminating condition.
      return result.Contents;
  } else {
      // Recurse it if results are truncated.
      param.ContinuationToken = result.NextContinuationToken;
      return result.Contents.concat(await getFilesRecursivelySub(param));
  }
}
app.get("/copypics/:_id", function (req,res) {

    var params = {
      Bucket: 'servicemedia',
      Prefix: 'users/' + req.params._id + '/'
    }
    (async () => { 
    await getFilesRecursivelySub(params)
    .then() {
    res.send();
    }
    


  })();
 
    // var keys = await allBucketKeys(s3, params).promise();
    // // console.log(keys);
    // res.send(keys);
    // var keys = [];
    // const listAllKeys = (params, out = []) => new Promise((resolve, reject) => {
    //   s3.listObjectsV2(params).promise()
    //     .then(({Contents, IsTruncated, NextContinuationToken}) => {
    //       out.push(...Contents);
    //       !IsTruncated ? resolve(out) : resolve(listAllKeys(Object.assign(params, {ContinuationToken: NextContinuationToken}), out));
    //     })
    //     .catch(reject);
    // });
    
    // listAllKeys(params)
    //   .then(console.log)
    //   .catch(console.log);
    // s3.listObjects(params, function(err, data) {
    //     if (err) {
    //         console.log(err);
    //         res.send("error " + err);
    //     }
    //     if (data.Contents.length == 0) {
    //         console.log("no content found");
    //         res.send("no content");
    //     } else {
    //         let response = "";
    //         let content = data.Contents;
    //         // console.log(content);
    //         // for (let i = 0; i < content.length; i++) {
    //         //   response = response +"<br> "+ content[i].name;
    //         // }

    //         data.Contents.forEach((elem) => {
    //           if (elem.Key.includes(".original.")) {
    //             keys = keys.concat(elem.Key);
    //           }
    //         });
    //         res.send(keys);
    //     }
    // });
});

app.post("/convert_to_ogg/", function (req, res) {
    //send "Hello World" to the client as html
    // console.log("trina scrape...");
    // let url = "/practikorkus_20191210.mp3";

    console.log("tryna convert_to_ogg with audio id " + req.body._id);
    // let stream = http.get('http://kork.us.s3.amazonaws.com/audio/practikorkus_20191210.mp3');
    // let file = fs.createWriteStream("tmp.ogg");
    // http.get("http://kork.us.s3.amazonaws.com/audio/practikorkus_20191210.mp3", res => {
    //     res.pipe(file);
    //     let data = "";

    //     res.on("data", d => {
    //         data += d;
    //     });
    //     res.on("end", () => {
    //         console.log("done");
    //     });
    // });
    (async () => {
            ffmpeg({source: 'http://kork.us.s3.amazonaws.com/audio/practikorkus_20191210.mp3'})
            .setFfmpegPath(ffmpeg_static)
            .audioBitrate(256)
            .audioCodec('vorbis')
            .format('ogg')

            .on('end', () => {
                // ...
                console.log("done squoze an ogg");
            })
            .on('error', err => {
                console.error(err);
            })
            .on('progress', function(info) {
                console.log('progress ' + info.percent + '%');
            })
            .save('test.ogg');
            // fmpeg({ timeout: 432000, source: 'http://kork.us.s3.amazonaws.com/audio/practikorkus_20191210.mp3'}).addOptions([
            //     '-profile:v baseline', // baseline profile (level 3.0) for H264 video codec
            //     '-level 3.0', 
            //     '-s 640x360',          // 640px width, 360px height output video dimensions
            //     '-start_number 0',     // start the first .ts segment at index 0
            //     '-hls_time 10',        // 10 second segment duration
            //     '-hls_list_size 0',    // Maxmimum number of playlist entries (0 means all entries/infinite)
            //     '-f hls'               // HLS format
            //   ]).output('output.m3u8').on('end', callback).run()

    })();
});


app.get("/stream_vid/", function (req, res) {
    //send "Hello World" to the client as html
    // console.log("trina scrape...");
    // let url = "/practikorkus_20191210.mp3";
    console.log(ffmpeg_static);
    // let stream = http.get('http://kork.us.s3.amazonaws.com/audio/practikorkus_20191210.mp3');
    // let file = fs.createWriteStream("tmp.ogg");
    // http.get("http://kork.us.s3.amazonaws.com/audio/practikorkus_20191210.mp3", res => {
    //     res.pipe(file);
    //     let data = "";

    //     res.on("data", d => {
    //         data += d;
    //     });
    //     res.on("end", () => {
    //         console.log("done");
    //     });
    // });
    (async () => {
        // var host = '192.168.1.160';
        // var port = '1935';
        // var path = '/live/test';
        
    //     ffmpeg('rtmp://'+host+':'+port+path, { timeout: 432000 }).addOptions([
    //         '-c:v libx264',
    //         '-c:a aac',
    //         '-ac 1',
    //         '-strict -2',
    //         '-crf 18',
    //         '-profile:v baseline',
    //         '-maxrate 400k',
    //         '-bufsize 1835k',
    //         '-pix_fmt yuv420p',
    //         '-hls_time 10',
    //         '-hls_list_size 6',
    //         '-hls_wrap 10',
    //         '-start_number 1'
    //       ]).output('public/videos/output.m3u8').on('end', () => {
    //         // ...
    //         console.log("done squeezin vidz");
    //     //   })
    //     })
    //     
        let path = ffmpeg_static;
        var proc = ffmpeg('rtmp://192.168.1.160:1935/live/test', { timeout: 432000 })
        .setFfmpegPath(path)
        // set video bitrate
        .videoBitrate(1024)
        // set h264 preset
        // .addOption('preset','superfast')
        // set target codec
        .videoCodec('libx264')
        // set audio bitrate
        .audioBitrate('128k')
        // set audio codec
        .withAudioCodec('aac')

        .format('mp4')
        // set number of audio channels
        .audioChannels(2)
        // set hls segments time
        .addOption('-hls_time', 10)
        // include all the segments in the list
        .addOption('-hls_list_size',0)
        // .on('progress', function(prog) {
        //     console.log(prog);
        // })
        // setup event handlers
        .on('end', function() {
            console.log('file has been converted succesfully');
        })
        .on('error', function(err) {
            console.log('an error happened: ' + err.message);
        })
        // save to file
        .save('public/videos/output.m3u8');

        // proc = proc
        // proc.setFfmpegPath(ffmpeg_static);
        })();

});



// // host, port and path to the RTMP stream
// var host = '127.0.0.1';
// var port = '1935';
// var path = '/live/test';

// function callback() { console.log("done streaming")}// do something when stream ends and encoding finshes }

// (async () => {
//     var host = '127.0.0.1'
//     var port = '1935'
//     var path = '/live/test'
    
//     ffmpeg('rtmp://'+host+':'+port+path, { timeout: 432000 }).addOptions([
//         '-c:v libx264',
//         '-c:a aac',
//         '-ac 1',
//         '-strict -2',
//         '-crf 18',
//         '-profile:v baseline',
//         '-maxrate 400k',
//         '-bufsize 1835k',
//         '-pix_fmt yuv420p',
//         '-hls_time 10',
//         '-hls_list_size 6',
//         '-hls_wrap 10',
//         '-start_number 1'
//       ]).output('public/videos/output.m3u8')
//         .on('progress', (info) => {
//             console.log("squeezing to hls " + info);
//         })
//         .on('err', (err) => {
//             console.log("error squeezin vidz" + err);
//         })
//         .on('end', () => {
//             console.log("done squeezin vidz");
//         })
//         res.send("maybe streaming now at /public/videos/")
// })();