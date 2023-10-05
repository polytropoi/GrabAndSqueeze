
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
            window.location.href = './login.html';
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
            bigSwitch();    
        }
        });
    } else {
        window.location.href = './login.html';
        // console.log("cookies are null?" + cookie._id);
    }
}

var hostname = "";
// var cookie = Cookies.get();
function authreq() {
  var uName = $( "#uname" ).val();
  var uPass = $( "#upass" ).val();
  console.log("tryna submit for uName " + uName);
  var posting = $.ajax({
  url: hostname + "/authreq",
  type: 'POST',
    contentType: "application/json; charset=utf-8",
  dataType: "json",
  data: JSON.stringify({
        uname: uName,
        upass: uPass
        // param2: $('#textbox2').val()
      }),
    success: function( data, textStatus, xhr ){
        console.log(data);
        var r = data.replace(/["']/g, ""); //cleanup
        var resp = r.split('~'); //response is tilde delimited
        Cookies.set('_id', resp[0], { expires: 7 });
        $('#response pre').html( "logged in as " + resp[1] );
        window.localStorage.setItem("smToken", resp[3]);
        cookie = Cookies.get();
        location.href = "./index.html";  
    },
    error: function( xhr, textStatus, errorThrown ){
        console.log( xhr.responseText );
        $('#theForm').html( 'Sorry, something went wrong: \n' + xhr.responseText);
        Cookies.remove('_id');
      }
    });
  }

function logout() {
    Cookies.remove('_id');
    // location.reload();
    let data = {};
    axios.post('/logout/', data)
    .then(function (response) {
    // console.log(JSON.stringify(response));
    // var jsonResponse = response.data;
    //  var jsonResponse = response.data;
    
    console.log(response.data);
    location.reload();
    });

} 
function convertTimestamp(unixtimestamp){
    var months_arr = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var date = new Date(unixtimestamp*1000);
    var year = date.getFullYear();
    var month = months_arr[date.getMonth()];
    var day = date.getDate();
    var hours = date.getHours();
    var minutes = "0" + date.getMinutes();
    var seconds = "0" + date.getSeconds();
    var convdataTime = month+' '+day+' '+year+' '+hours + ':' + minutes.substr(-2) + ':' + seconds.substr(-2);
    return convdataTime;
    }

function getParameterByName(name, url) { //to get querystring params
    if (!url) {
        url = window.location.href;
    }
    name = name.replace(/[\[\]]/g, "\\$&");
    var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, " "));
    }
function timestamp() {
        var d = new Date();
        var n = d.getTime();
        return n;
}


function bigSwitch() { //light up proper elements and get the stuff
    if (type == null) {
        $("#topPage").show();
        $("#pageTitle").html("");
        showDashBoid();
    } else {
        $("#topPage").hide();
    }
    console.log("tryna switch to type " + type);
    if (!type) {
        type = "dashboard";
    }
    switch (type) { //type is first level param for each route
    case "dashboard": //uses :appid param
        $("#cards").show();
        $("#tables").show();
        // $("#table1").show();
        // $("#table1Title").html("Inventory");
        // $("#table2").show();
        // $("#table2Title").html("Activities");
        // $("#table3").show();
        // $("#table3Title").html("Scores");
        // $("#table4").show();
        // $("#table4Title").html("Purchases");
        $("#pageTitle").html("Dashboard - " + username);
        // getProfile();
    break;    
        case "encode_video": //uses :appid param
        $("#topPage").show();
        // $("#topPage").html("Ent");
        $("#pageTitle").html("Encode Video");
        EncodeVideo();

        // getWebXRScene();
    break;    
    case "appdash": //uses :appid param
        $("#cards").show();
        // getAppDash();
    break;       
   
    }
}

function EncodeVideo () {
    $("#encodeVideoPanel").show();

}

