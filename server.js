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
    // app.use(helmet());
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

app.get('/resize_uploaded_picture/:_id', function (req, res) {
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
            // var params = {Bucket: 'servicemedia', Key: "users/" + picture_item.userID + "/" + picture_item._id + "." + originalName};
            s3.headObject(params, function (err, url) {
                if (err) {
                    console.log(err);
                    res.send("no image in bucket");
                } else {
                    console.log("The URL is", url);
                    // (async () => {
                    // await s3.getObject(params, function (err, data) {
                    if (err) {
                        console.log(err);
                        res.end("couldn't get no image data");
                    } else {
                        (async () => { //do these jerbs one at a time..
                        //  getObject 
                        let data = await s3.getObject(params).promise();
                        await sharp(data.Body)
                        .resize({
                          kernel: sharp.kernel.nearest,
                          width: 1024,
                          width: 1024,
                          fit: 'contain'
                        })
                        .toFormat(format)
                        .toBuffer()
                        .then(rdata => {
                            // let buf = Buffer.from(rdata);
                            // let encodedData = rdata.toString('base64');
                            // console.log(encodedData)
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
                              })//putObject returns request not promise, must add this to promisify
                            })
                        .catch(err => {console.log(err); res.end(err);});
                        await sharp(data.Body)
                        .resize({
                          kernel: sharp.kernel.nearest,
                          width: 512,
                          width: 512,
                          fit: 'contain'
                        })
                        .toFormat(format)
                        .toBuffer()
                        .then(rdata => {
                            // let encodedData = rdata.toString('base64');
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
                          width: 256,
                          width: 256,
                          fit: 'contain'
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