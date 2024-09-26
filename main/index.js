
var cookie = Cookies.get();
var type = getParameterByName("type", window.location.href); //these params used for routing in bigSwitch
var appid = getParameterByName("appid", window.location.href);
var uid = getParameterByName("uid", window.location.href);
var itemid = getParameterByName("iid", window.location.href);
var mode = getParameterByName("mode", window.location.href);
var parent = getParameterByName("parent", window.location.href);
var aframe_enviro = getParameterByName("env", window.location.href);

const videoInput = document.getElementById("videoInput");
const videpPreview = document.getElementById("videoPreview");

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
        // showDashBoid();
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
    break;    
    
    case "encode_video_local_path": //uses :appid param
    $("#topPage").show();
    // $("#topPage").html("Ent");
    $("#pageTitle").html("Encode Video");
    EncodeVideoLocalPath();
break;    
   
    }
}

function EncodeVideo () {
    $("#encodeVideoPanel").show();
    videoInput.addEventListener("change", updateVideoDisplay);
}

function EncodeVideoLocalPath () {

    $("#encodeVideoPanelLocalPath").show();
    // $("#encodeVideoPanelLocalPath").show();
    // id="videoLocalPathSubmitButton"  
    // videoInput.addEventListener("change", updateVideoDisplay);
    document.getElementById("videoLocalPathForm").addEventListener('submit', submitVideoLocalPath);

}

function submitVideoLocalPath(e) {
    document.getElementById("videoLocalPathSubmitButton").style.display = "hidden";
    e.preventDefault();
    let path = document.getElementById("videoPathInput").value;
    let encoding = "HD"
    let radios = document.querySelectorAll('input[type="radio"]');
    for (let radio of radios) {
      if (radio.checked) {
        encoding = radio.value;
      }
    }

    console.log(path + " " + encoding);

    var vpost = $.ajax({
        url: hostname + "/process_video_hls_local",
        type: 'POST',
          contentType: "application/json; charset=utf-8",
        dataType: "json",
        data: JSON.stringify({
              fullpath: path,
              encoding: encoding
                            // param2: $('#textbox2').val()
            }),
          success: function( data, textStatus, xhr ){
              console.log(data);
     
          },
          error: function( xhr, textStatus, errorThrown ){
              console.log("error! " + xhr.responseText );

            }
          });
}



function updateVideoDisplay() {
//   while (preview.firstChild) {
//     preview.removeChild(preview.firstChild);
//   }

  const curFiles = videoInput.files;
  if (curFiles.length === 0) {
    const para = document.createElement("p");
    para.textContent = "No files currently selected for upload";
    preview.appendChild(para);
  } else {
    document.getElementById("videoSubmitButton").style.display = 'block';
    const list = document.createElement("ol");
    videoPreview.appendChild(list);

    for (const file of curFiles) {
      const listItem = document.createElement("li");
      const para = document.createElement("p");
      if (videoFileType(file)) {
        para.textContent = `File name ${file.name}, file size ${returnFileSize(
          file.size,
        )}.`;
        const image = document.createElement("img");
        image.src = URL.createObjectURL(file);

        listItem.appendChild(image);
        listItem.appendChild(para);
      } else {
        para.textContent = `File name ${file.name}: Not a valid file type. Update your selection.`;

        }
    
        }
    }
  }
// }

// https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Image_types
const videoFileTypes = [
  "video/mp4"
];

function videoFileType(file) {
  return videoFileTypes.includes(file.type);
}

function returnFileSize(number) {
  if (number < 1024) {
    return `${number} bytes`;
  } else if (number >= 1024 && number < 1048576) {
    return `${(number / 1024).toFixed(1)} KB`;
  } else if (number >= 1048576) {
    return `${(number / 1048576).toFixed(1)} MB`;
  }
}
