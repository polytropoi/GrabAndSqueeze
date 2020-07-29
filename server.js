//copyright 2020 servicemedia.net
var express = require("express")
    // , https = require('https')
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
    , bodyParser = require('body-parser')
    , mongojs = require("mongojs")
    , helmet = require('helmet')
    , ObjectID = require("bson-objectid")

    app = express();
    app.use(cors());
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

var whitelist = ['https://servicemedia.net', 'http://localhost:3000']
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
const { tmpdir } = require("os");
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
              if (err) {
                  console.log(err);
                  res.end("couldn't get no image data");
              } else {
                  (async () => { //do these jerbs one at a time..
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
                  .catch(err => {console.log(err); res.end(err);});
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
                  .catch(err => {console.log(err); res.end(err);});
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
                  .catch(err => {console.log(err); res.end(err);});
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
                  .catch(err => {console.log(err); res.end(err);});
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
                  .catch(err => {console.log(err); res.end(err);});
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
                  .catch(err => {console.log(err); res.end(err);});
                  res.send("resize successful!");
                
                }

                })();//end async
                
                  }
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

app.get("/update_s3_audiopaths/:_id", function (req,res) {
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
            if (((elem.Key.includes(".aif") || elem.Key.includes(".aiff") ||  elem.Key.includes(".WAV") || elem.Key.includes(".AIF") || elem.Key.includes(".AIFF") ||
              elem.Key.includes(".wav"))) && !elem.Key.includes("/audio/originals/")) {
              s3.headObject({Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + req.params._id + '/audio/originals/' + filename}, function(err, data) { //where it should be
                if (err) { //object isn't in proper folder, copy it over
                console.log("need to copy " + filename);  
                s3.copyObject({CopySource: process.env.ROOT_BUCKET_NAME + '/' + elem.Key, Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + req.params._id + '/audio/originals/' + filename }, function (err,data){
                    if (err) {
                      console.log("ERROR copyObject");
                      console.log(err);
                    }
                    else {
                      console.log('SUCCESS copyObject');
                    }
                  });
                } else {
                  // console.log("found original, no need to copy" + filename);
                }
              });
            } else if (((elem.Key.includes(".ogg") || elem.Key.includes(".MP3") || elem.Key.includes(".OGG") || elem.Key.includes(".mp3"))) && !elem.Key.includes("/audio/")) {
              oKeys = oKeys.concat(filename);
              s3.headObject({Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + req.params._id + '/audio/originals/' + filename}, function(err, data) { //where it should be
                if (err) { //object isn't in proper folder, copy it over
                console.log("need to copy " + filename);  
                s3.copyObject({CopySource: process.env.ROOT_BUCKET_NAME + '/' + elem.Key, Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + req.params._id + '/audio/originals/' + filename }, function (err,data){
                    if (err) {
                      console.log("ERROR copyObject");
                      console.log(err);
                    }
                    else {
                      console.log('SUCCESS copyObject');
                    }
                  });
                } else {
                  // console.log("found original, no need to copy" + filename);
                }
              });
            } else if ((elem.Key.includes(".png")) && !elem.Key.includes("/audio/") && !elem.Key.includes(".original.") && !elem.Key.includes(".standard.") && !elem.Key.includes(".quarter.") && !elem.Key.includes(".half.") && !elem.Key.includes(".thumb.")) {
              oKeys = oKeys.concat(filename);
              s3.headObject({Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + req.params._id + '/audio/' + filename}, function(err, data) { //where it should be
                if (err) { //object isn't in proper folder, copy it over
                console.log("need to copy " + filename);  
                s3.copyObject({CopySource: process.env.ROOT_BUCKET_NAME + '/' + elem.Key, Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + req.params._id + '/audio/' + filename }, function (err,data){
                    if (err) {
                      console.log("ERROR copyObject");
                      console.log(err);
                    }
                    else {
                      console.log('SUCCESS copyObject');
                    }
                  });
                } else {
                  // console.log("found original, no need to copy" + filename);
                }
              });
            } else if (((elem.Key.includes(".ogg") || elem.Key.includes(".MP3") || elem.Key.includes(".OGG") || elem.Key.includes(".mp3"))) && !elem.Key.includes(".original.")) {
              oKeys = oKeys.concat(filename);
              s3.headObject({Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + req.params._id + '/audio/' + filename}, function(err, data) { //where it should be
                if (err) { //object isn't in proper folder, copy it over
                console.log("need to copy " + filename);  
                s3.copyObject({CopySource: process.env.ROOT_BUCKET_NAME + '/' + elem.Key, Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + req.params._id + '/audio/' + filename }, function (err,data){
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
            } 
            });
      res.send(oKeys);
    }
});

app.get('/process_audio/:_id', cors(corsOptions), requiredAuthentication, function (req, res) {
  console.log("tryna process audio : " + req.params._id);
  var o_id = ObjectID(req.params._id);
  db.audio_items.findOne({"_id": o_id}, function(err, audio_item) {
    if (err || !audio_item) {
        console.log("error getting image item: " + err);
        callback("no image in db");
        res.send("no image in db");
    } else {
      console.log(JSON.stringify(audio_item));
      s3.headObject({Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + audio_item.userID + '/audio/originals/' + audio_item._id + ".original." + audio_item.filename}, function(err, data) { //where it should be
        if (err) { //object isn't in proper folder, copy it over
          console.log("dint find no file at s3 like that...");
        } else {
          console.log("found original " + audio_item.filename);
          let hasSentResponse = false;
          (async () => {
            var params = {Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + audio_item.userID + '/audio/originals/' + audio_item._id + ".original." + audio_item.filename};
            let data = await s3.getObject(params).createReadStream();
            ffmpeg(data)
            .setFfmpegPath(ffmpeg_static)
            
            .output('tmp.png')            
            .complexFilter(
              [
                  '[0:a]aformat=channel_layouts=mono,showwavespic=s=600x200'
              ]
            )
            .outputOptions(['-vframes 1'])
            // .format('png')

            .output('tmp.ogg')
            .audioBitrate(256)
            .audioCodec('libvorbis')
            .format('ogg')

            .output('tmp.mp3')
            .audioBitrate(256)
            .audioCodec('libmp3lame')
            .format('mp3')

            .on('end', () => {
                console.log("done squeezin audio");
                s3.putObject({
                  Bucket: process.env.ROOT_BUCKET_NAME,
                  Key: "users/" + audio_item.userID + "/audio/" + audio_item._id +"."+path.parse(audio_item.filename).name + ".ogg",
                  Body: fs.readFileSync('tmp.ogg'),
                  ContentType: 'audio/ogg'
                }, function (error, resp) {
                  if (error) {
                    console.log('error putting  pic' + error);
                  } else {
                    console.log('Successfully uploaded  ogg with response: ' + JSON.stringify(resp));
                  }
              });
                s3.putObject({
                  Bucket: process.env.ROOT_BUCKET_NAME,
                  Key: "users/" + audio_item.userID + "/audio/" + audio_item._id +"."+path.parse(audio_item.filename).name + ".mp3",
                  Body: fs.readFileSync('tmp.mp3'),
                  ContentType: 'audio/mp3'
                }, function (error, resp) {
                  if (error) {
                    console.log('error putting  pic' + error);
                  } else {
                    console.log('Successfully uploaded mp3 with response: ' + JSON.stringify(resp));
                  }
              });
                s3.putObject({
                  Bucket: process.env.ROOT_BUCKET_NAME,
                  Key: "users/" + audio_item.userID + "/audio/" + audio_item._id +"."+path.parse(audio_item.filename).name + ".png",
                  Body: fs.readFileSync('tmp.png'),
                  ContentType: 'image/png'
                }, function (error, resp) {
                  if (error) {
                    console.log('error putting  pic' + error);
                  } else {
                    console.log('Successfully uploaded png with response: ' + JSON.stringify(resp));
                  }
              });
              })
            .on('error', err => {
                console.error(err);
                res.send("error! " + err);
            })
            .on('progress', function(info) {
                console.log('progress ' + info.percent + '%');
                if (!hasSentResponse) {
                  hasSentResponse = true;
                  res.send("processing!");
                }
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