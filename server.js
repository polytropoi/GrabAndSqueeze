//copyright 2020 servicemedia.net
var express = require("express")
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

var adminEmail = "polytropoi@gmail.com";

var domainAdminEmail = "polytropoi@gmail.com";


var whitelist = ['https://servicemedia.net', 'http://localhost:4000'];

// var corsOptions = function (origin) {
// //    console.log("checking vs whitelist:" + origin);
//     if ( whitelist.indexOf(origin) !== -1 ) {
//         return true;
//     } else {
//         return true; //fornow...
//     }
// };

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

var databaseUrl = process.env.MONGO_URL; //servicemedia connstring

var collections = ["acl", "auth_req", "domains", "apps", "assets", "models", "users", "audio_items", "text_items", "audio_item_keys", "image_items", "video_items",
    "obj_items", "paths", "keys", "scores", "attributes","achievements","activity", "purchases", "storeitems", "scenes", "groups", "weblinks", "locations", "iap"];

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

app.get("/", function (req, res) {
    //send "Hello World" to the client as html
        res.send("howdy!");
});

app.get("/scrape_webpage/:pageurl", function (req, res) {
    //send "Hello World" to the client as html
    // console.log("trina scrape...");
    let url = "https://" + req.params.pageurl;
    if (!url)
    url = "https://xrswim.com";

    (async () => {
        console.log("trina scrape...");
        let response = "";
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        // await page.setViewport({ width: 1024, height: auto});
        const override = Object.assign(page.viewport(), {width: 1024, height: 1024});
        await page.setViewport(override);
        await page.goto(url);
        const pagepic = await page.screenshot({fullPage: true});
        sharp(pagepic)
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
            console.log("response: " + response);
            res.send(response);
        })
        .catch(err => {console.log(err); res.send(err);});
        await browser.close();
    })();
});

app.post('/resize_uploaded_picture/', function (req, res) {
    console.log("tryna resize pic with key: " + req.body._id);
    var o_id = ObjectID(req.body._id);
    db.images.findOne({"_id": o_id}, function(err, image) {
        if (err || !image) {
            console.log("error getting location item: " + err);
        } else {
            var params = {Bucket: 'archive1', Key: "archived/" + req.body._id + "/" + itemKey};
            s3.getSignedUrl('getObject', params, function (err, url) {
                if (err) {
                    console.log(err);
                } else {
                    console.log("The URL is", url);
                }
            });
            console.log("returning image item : " + image);
        }
    });
});

app.get("/convert_to_ogg/", function (req, res) {
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
            // ffmpeg({source: 'http://kork.us.s3.amazonaws.com/audio/practikorkus_20191210.mp3'})
            ffmpeg({source: 'http://kork.us.s3.amazonaws.com/audio/practikorkus_20191210.mp3'})
            .setFfmpegPath(ffmpeg_static)
            .audioBitrate(256)
            .audioCodec('vorbis')
            .format('ogg')

            .on('end', () => {
                // ...
                console.log("squoze on ogg");
            })
            .on('error', err => {
                console.error(err);
            })
            .on('progress', function(info) {
                console.log('progress ' + info.percent + '%');
            })
            .save('test.ogg');


    })();
});


