var hostname = "";
var cookie = Cookies.get();

// function authreq() {
//   var uName = $( "#uname" ).val();
//   var uPass = $( "#upass" ).val();
//   console.log("tryna submit for uName " + uName);
//   var posting = $.ajax({
//   url: hostname + "/authreq",
//   type: 'POST',
//     contentType: "application/json; charset=utf-8",
//   dataType: "json",
//   data: JSON.stringify({
//         uname: uName,
//         upass: uPass
//         // param2: $('#textbox2').val()
//       }),
//     success: function( data, textStatus, xhr ){
//         console.log(data);
//         var r = data.replace(/["']/g, ""); //cleanup
//         var resp = r.split('~'); //response is tilde delimited
//         Cookies.set('_id', resp[0], { expires: 7 });
//         $('#response pre').html( "logged in as " + resp[1] );
//         window.localStorage.setItem("smToken", resp[3]);
//         cookie = Cookies.get();
//         location.href = "./index.html";  
//     },
//     error: function( xhr, textStatus, errorThrown ){
//         console.log( xhr.responseText );
//         $('#theForm').html( 'Sorry, something went wrong: \n' + xhr.responseText);
//         Cookies.remove('_id');
//       }
//     });
//   }


  document.getElementById("loginForm").addEventListener("submit", (e) => {
    e.preventDefault(); 
    // console.log("trynba sumbit for " + uName);
    var uName = $( "#uname" ).val();
  var uPass = $( "#upass" ).val();
  console.log("tryna submit for uName " + uName);

  if (uName != undefined) {
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
    } else {
        console.log("undefined uname");
    }
  });

    // handle submit
//   });
//   document.getElementById("loginbutton").addEventListener("click", authreq());