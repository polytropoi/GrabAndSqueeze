
var cookie = Cookies.get();
var type = getParameterByName("type", window.location.href); //these params used for routing in bigSwitch
var appid = getParameterByName("appid", window.location.href);
var uid = getParameterByName("uid", window.location.href);
var itemid = getParameterByName("iid", window.location.href);
var mode = getParameterByName("mode", window.location.href);
var parent = getParameterByName("parent", window.location.href);
var aframe_enviro = getParameterByName("env", window.location.href);
var userid = "";
var username = "";
var auth = "";
var apps = {};
amirite();
function amirite () {
    if (cookie != null && cookie._id != null) {
    console.log("gotsa cookie: " + cookie._id );
    $.get( "/ami-rite/" + cookie._id, function( data ) {
        // console.log("amirite : " + JSON.stringify(data));
        if (data == 0) {
            window.location.href = './sign_in.html';
            // console.log("data equals zero?");
        } else {
            var userNameLabel = document.getElementById('userNameLabel');
            username = data.userName;
            userid = data.userID;
            auth = data.authLevel;
            apps = data.apps;
            domains = data.domains;
            userNameLabel.innerText = username;
            let html = "";  
            }
        });
    } else {
        window.location.href = './sign_in.html';
        // console.log("cookies are null?" + cookie._id);
    }
}