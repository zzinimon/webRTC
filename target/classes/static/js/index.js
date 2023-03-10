/*
 * (C) Copyright 2014 Kurento (http://kurento.org/)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

var ws = new WebSocket('wss://' + location.host + '/call');
var videoInput;
var videoOutput;
var webRtcPeer;
var response;
var callerMessage;
var from;

var userName = null;
var registerState = null;
const NOT_REGISTERED = 0;
const REGISTERING = 1;
const REGISTERED = 2;

function setRegisterState(nextState) {
	switch (nextState) {
	case NOT_REGISTERED:
		enableButton('#register', 'register()');
		setCallState(NO_CALL);
		break;
	case REGISTERING:
		disableButton('#register');
		break;
	case REGISTERED:
		disableButton('#register');
		setCallState(NO_CALL);
		break;
	default:
		return;
	}
	registerState = nextState;
}

var callState = null;
const NO_CALL = 0;
const PROCESSING_CALL = 1;
const IN_CALL = 2;

function setCallState(nextState) {
	switch (nextState) {
	case NO_CALL:
		enableButton('#call', 'call()');
		disableButton('#terminate');
		disableButton('#play');
		break;
	case PROCESSING_CALL:
		disableButton('#call');
		disableButton('#terminate');
		disableButton('#play');
		break;
	case IN_CALL:
		disableButton('#call');
		enableButton('#terminate', 'stop()');
		disableButton('#play');
		break;
	default:
		return;
	}
	callState = nextState;
}

window.onload = function() {
	console = new Console();
	setRegisterState(NOT_REGISTERED);
	var drag = new Draggabilly(document.getElementById('videoSmall'));
	videoInput = document.getElementById('videoInput');
	videoOutput = document.getElementById('videoOutput');
	document.getElementById('name').focus();
}

//window.onbeforeunload = function() {
//	alert("ws is closing");
//	ws.close();
//}

ws.onmessage = function(message) {
	var parsedMessage = JSON.parse(message.data);
	console.info('Received message: ' + message.data);

	switch (parsedMessage.id) {
	case 'cameraResponse':
		cameraResponse(parsedMessage);
		break;
	case 'cameraStopResponse':
		cameraStopResponse(parsedMessage);
		break;
	case 'recordResponse':
		recordResponse(parsedMessage);
		break;
		

	case 'registerResponse':
		registerResponse(parsedMessage);
		break;
	case 'callResponse':
		callResponse(parsedMessage);
		break;
	case 'incomingCall':
		incomingCall(parsedMessage);
		break;
	case 'startCommunication':
		startCommunication(parsedMessage);
		break;
	case 'stopCommunication':
		console.info('Communication ended by remote peer');
		stop(true);
		break;
	case 'iceCandidate':
		webRtcPeer.addIceCandidate(parsedMessage.candidate, function(error) {
			if (error)
				return console.error('Error adding candidate: ' + error);
		});
		break;
	default:
		console.error('Unrecognized message', parsedMessage);
	}
}

function registerResponse(message) {
	if (message.response == 'accepted') {
		setRegisterState(REGISTERED);
	} else {
		setRegisterState(NOT_REGISTERED);
		var errorMessage = message.message ? message.message
				: 'Unknown reason for register rejection.';
		console.log(errorMessage);
		alert('Error registering user. See console for further information.');
	}
}

function callResponse(message) {
	if (message.response != 'accepted') {
		console.info('Call not accepted by peer. Closing call');
		var errorMessage = message.message ? message.message
				: 'Unknown reason for call rejection.';
		console.log(errorMessage);
		stop();
	} else {
		setCallState(IN_CALL);
		webRtcPeer.processAnswer(message.sdpAnswer, function(error) {
			if (error)
				return console.error(error);
		});
	}
}

function startCommunication(message) {
	setCallState(IN_CALL);
	webRtcPeer.processAnswer(message.sdpAnswer, function(error) {
		if (error)
			return console.error(error);
	});
}

function incomingCall(message) {
	// If bussy just reject without disturbing user
	if (callState != NO_CALL) {
		var response = {
			id : 'incomingCallResponse',
			from : message.from,
			callResponse : 'reject',
			message : 'bussy'
		};
		return sendMessage(response);
	}

	setCallState(PROCESSING_CALL);
	if (confirm('User ' + message.from
			+ ' is calling you. Do you accept the call?')) {
		showSpinner(videoInput, videoOutput);

		from = message.from;
		var options = {
			localVideo : videoInput,
			remoteVideo : videoOutput,
			onicecandidate : onIceCandidate,
			onerror : onError
		}
		webRtcPeer = new kurentoUtils.WebRtcPeer.WebRtcPeerSendrecv(options,
				function(error) {
					if (error) {
						return console.error(error);
					}
					webRtcPeer.generateOffer(onOfferIncomingCall);
				});

	} else {
		var response = {
			id : 'incomingCallResponse',
			from : message.from,
			callResponse : 'reject',
			message : 'user declined'
		};
		sendMessage(response);
		stop();
	}
}

function onOfferIncomingCall(error, offerSdp) {
	if (error)
		return console.error("Error generating the offer");
	var response = {
		id : 'incomingCallResponse',
		from : from,
		callResponse : 'accept',
		sdpOffer : offerSdp
	};
	sendMessage(response);
}

function register() {
	var name = document.getElementById('name').value;
	if (name == '') {
		window.alert('You must insert your user name');
		return;
	}
	setRegisterState(REGISTERING);

	var message = {
		id : 'register',
		name : name
	};
	sendMessage(message);
	userName=name;
	document.getElementById('peer').focus();
}

function call() {
	if (document.getElementById('peer').value == '') {
		window.alert('You must specify the peer name');
		return;
	}
	setCallState(PROCESSING_CALL);
	showSpinner(videoInput, videoOutput);

	var options = {
		localVideo : videoInput,
		remoteVideo : videoOutput,
		onicecandidate : onIceCandidate,
		onerror : onError
	}
	webRtcPeer = new kurentoUtils.WebRtcPeer.WebRtcPeerSendrecv(options,
		function(error) {
			if (error) {
				return console.error(error);
			}
			webRtcPeer.generateOffer(onOfferCall);
	});
}

function onOfferCall(error, offerSdp) {
	if (error)
		return console.error('Error generating the offer');
	console.log('Invoking SDP offer callback function');
	var message = {
		id : 'call',
		from : document.getElementById('name').value,
		to : document.getElementById('peer').value,
		sdpOffer : offerSdp
	};
	sendMessage(message);
}

function stop(message) {
	setCallState(NO_CALL);
	if (webRtcPeer) {
		webRtcPeer.dispose();
		webRtcPeer = null;

		if (!message) {
			var message = {
				id : 'stop'
			}
			sendMessage(message);
		}
	}
	hideSpinner(videoInput, videoOutput);
}

function onError() {
	setCallState(NO_CALL);
}

function onIceCandidate(candidate) {
	console.log("Local candidate" + JSON.stringify(candidate));

	var message = {
		id : 'onIceCandidate',
		candidate : candidate
	};
	sendMessage(message);
}

function sendMessage(message) {
	var jsonMessage = JSON.stringify(message);
	console.log('Sending message: ' + jsonMessage);
	ws.send(jsonMessage);
}

function showSpinner() {
	for (var i = 0; i < arguments.length; i++) {
		arguments[i].poster = './img/transparent-1px.png';
		arguments[i].style.background = 'center transparent url("./img/spinner.gif") no-repeat';
	}
}

function hideSpinner() {
	for (var i = 0; i < arguments.length; i++) {
		arguments[i].src = '';
		arguments[i].poster = './img/webrtc.png';
		arguments[i].style.background = '';
	}
}

function disableButton(id) {
	$(id).attr('disabled', true);
	$(id).removeAttr('onclick');
}

function enableButton(id, functionName) {
	$(id).attr('disabled', false);
	$(id).attr('onclick', functionName);
}

/**
 * Lightbox utility (to display media pipeline image in a modal dialog)
 */
$(document).delegate('*[data-toggle="lightbox"]', 'click', function(event) {
	event.preventDefault();
	$(this).ekkoLightbox();
});

function mute(){
	if (videoInput.muted) {
		videoInput.muted = false;
		var constraints = {
                audio:true,
                video:true
        };
        options = {
            audio : false,
            localVideo : videoInput,
            remoteVideo : videoOutput,
            mediaConstraints:constraints,
            onicecandidate : onIceCandidate,
            onerror : onError
        }
	} else {
		var constraints = {
                audio:false,
                video:true
        };
        options = {
            audio : false,
            localVideo : videoInput,
            remoteVideo : videoOutput,
            mediaConstraints:constraints,
            onicecandidate : onIceCandidate,
            onerror : onError
        }
		videoInput.muted = true;
	}
	let deviceId;
	 webUiCore.media.getDeviceList((list) => {
	 	for(let item of list) {
	 		if(item.kind == "videoInput") {
	 			if(item.label.indexOf(g_videoFacingMode) > -1){
	 				deviceId = item.deviceId;
	 				if(deviceId != null) {
	 					webUiCore.media.getUserMedia(constraints, (stream, err) => {
	 						if(stream != null) {
	 							webCore.rtc.setSource(g_localVideoId, stream);
	 							localCamera.srcObject = stream;
	 							localCamera.oncanplay = (ev) => {
	 						        localCamera.play();
	 						    };
	 						}
	 					});
	 				}
	 			}
	 		}
	 	}
	
	
	 });
}
function cameraOff(){
	let setCamera;
	if(videoInput.style.visibility=='hidden'){
		videoInput.style.visibility='visible'
		setCamera = 'visible';
	}else{
		videoInput.style.visibility='hidden'
		setCamera = 'hidden';
	}
	var options={
		id : 'cameraOff',
		user : userName,
		status: setCamera
	}
	sendMessage(options);
}
function cameraResponse(response){
	let cameraStatus = response.status
	videoOutput.style.visibility=cameraStatus
}

function cameraStop(){
	let videoInput = document.getElementById('videoInput');
	let cameraPaused;
	if(videoInput.paused){
		videoInput.play();
		cameraPaused = "false";
	}else{
		videoInput.pause();
		cameraPaused = "true";
	}
	var options={
		id : 'cameraStop',
		user : userName,
		status: cameraPaused
	}
	sendMessage(options);
}
function cameraStopResponse(response){
	let cameraPaused = response.status;
	if(cameraPaused){
		videoOutput.pause();
	}else{
		videoOutput.play();
	}
}

function getLocation(){
	var location = "right next to you";
	var options = {
		id :'gpsData',
		userName : userName,
		location : location
	}
	sendMessage(options);
}

function record(){
	alert("start record!");
	var options = {
		id :'recording',
		user : userName
	}
	sendMessage(options);
}
function recordResponse(response){
	let user = response.user
	alert(user+" started to record!!");
}

function screenShare(){
	alert("screenShare!");
}

function consoleClear(){
	console = new Console();
}
