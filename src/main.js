
var gameData = {
	shipMomentum: new Point({
			angle: 45,
			length: 0
		}),
	shipPower: 100
};

var baseColor = new Color(89/255, 155/255, 179/255);

project.currentStyle.strokeColor = 'white';
project.currentStyle.strokeWidth = 2;
project.currentStyle.font = "Optima-Regular";

// LAYERS

// Welcome screen and main menu
var welcomeLayer = project.activeLayer;
welcomeLayer.visible = false;

// Where things are really happening
var spaceLayer = new Layer();
//spaceLayer.visible = false;

// Layer showing controls (hidden when showing action, not affected by zoom in space)
var controlLayer = new Layer();
//controlLayer.visible = false;

// WELCOME SCREEN

welcomeLayer.activate();
//welcomeLayer.bringToFront();

var titleText = new PointText(new Point(30, 30));
titleText.content = "VoD";
titleText.style = {
    fontSize: 80,
    font: 'Optima-ExtraBlack',
    fillColor: 'black',
    strokeColor: 'white',
    justification: 'center',
    shadowColor: baseColor,
    shadowBlur: 20
};
titleText.position = view.bounds.center - view.bounds.leftCenter/2;

// SHIP AND SPACE

spaceLayer.activate();

var playerShip = new function() {
	ship = new Path([0,6],[3,3],[3,0],[6,3],[15,3],[18,6],[18,9],[15,12],[6,12],[3,15],[3,12],[0,9]);
	//ship = new Path([-10, -8], [10, 0], [-10, 8], [-8, 4], [-8, -4]);
	ship.momentum = gameData.shipMomentum;
	ship.power = gameData.shipPower;
	ship.thrust = new Point(0,0);
	ship.fillColor = "black";
	ship.closed = true;
	ship.shadowColor = baseColor;
	ship.shadowBlur = 20;
	ship.lastAngle = 0;
	ship.position = view.bounds.center;
	ship.setRotation = function(angle) {
		this.rotate(angle - this.lastAngle);
		this.lastAngle = angle;
	}
	ship.setRotation(ship.momentum.angle);
	/*
	ship.onMouseMove = function(event) {
		alert(this);
	}
	*/
	return {
		item: ship,
		
		showDecoration: function() {
			var decorationGroup = new Group();
			decorationGroup.name = "decorationGroup";
			
			if (ship.momentum.length > 3) {
				var momentumArrow = createArrow(ship.position, ship.momentum);
				momentumArrow.strokeColor = momentumArrow.fillColor = baseColor;
				decorationGroup.addChild(momentumArrow);
			}
			
			var powerCircle = new Path.Circle(ship.position + ship.momentum, ship.power);
			//powerCircle.strokeColor = new Color(0,255,255,0.25);
			//powerCircle.strokeWidth = 3;
			powerCircle.strokeColor = null;
			powerCircle.fillColor = {
				gradient: {
					stops: [
						[new Color(89/255, 155/255, 179/255,0), 0.05], 
						[new Color(89/255, 155/255, 179/255,0), 0.9],
						[new Color(89/255, 155/255, 179/255, 1), 1]
					],
					radial: true
				},
				origin: powerCircle.position,
				destination: powerCircle.bounds.rightCenter
			};
			//powerCircle.fillColor = new Color(0,0,0,0);
			decorationGroup.addChild(powerCircle);

			powerCircle.setThrust = function(point) {
				var existing = decorationGroup.children["arrowGroup"];
				if (existing) existing.remove();
				var arrowGroup = new Group();
				arrowGroup.name = "arrowGroup";
				ship.thrust = point - this.position;
				if (ship.momentum.length > 0 && ship.momentum.angle != ship.thrust.angle) {
					var newPathArrow = createArrow(ship.position, this.position + ship.thrust - ship.position);
					newPathArrow.strokeColor = newPathArrow.fillColor = "darkGrey";
					arrowGroup.addChild(newPathArrow);
				}
				var powerArrow = createArrow(this.position, ship.thrust);
				powerArrow.strokeColor = powerArrow.fillColor = "red";
				arrowGroup.addChild(powerArrow);
				arrowGroup.sendToBack();
				decorationGroup.addChild(arrowGroup);
				
				ship.setRotation(ship.thrust.angle);
			};
			powerCircle.on({
				mousemove: function(event) { this.setThrust(event.point) },
				mouseup: function(event) { this.setThrust(event.point) }
			});
			
			decorationGroup.bringToFront();
			powerCircle.sendToBack();
		}
	};
};

playerShip.showDecoration();

var centerOfSpace = spaceLayer.bounds.center;

function newRock(size) {
	var sizeString = size || "random";
	var w = Math.floor((Math.random()*80)+20);
	switch (sizeString) {
		case "small": w = 20; break;
		case "medium": w = 40; break;
		case "large": w = 60; break;
		case "huge": w = 100; break;
	}
	
	var rock = new Path();
	var c = new Point(w/2, w/2);
	var segments = Math.floor((Math.random()*6)+4);
	for (var a = 0; a < 360; a += Math.floor(360/segments)) {
		var l = Math.floor((Math.random()*w/6)+w*2/6);
		var p = new Point({ length: l, angle: a });
		rock.add(c + p);
	}
	rock.closed = true;
	rock.fillColor = "black";
	rock.strokeColor = "white";
	rock.shadowColor = baseColor;
	rock.shadowBlur = 20;
	
	return rock;
}

var rock = newRock();
rock.position = new Point(200,300);

function createBuoy(number) {
	
	var circle = new Path.Circle({
		center: new Point(100,100),
		radius: 10,
		fillColor: "red",
		shadowColor: "OrangeRed",
		shadowBlur: 20
	});
	circle.fillColor.saturation = 0;
	circle.shadowColor.alpha = 0;
	var buoyNumber = new PointText(circle.position);
	buoyNumber.content = number;
	buoyNumber.strokeWidth = 1;
	buoyNumber.fillColor = "white";
	buoyNumber.position = circle.position;
	
	var group = new Group(circle, buoyNumber);
	group.halo = circle;
	
	circle.lightsOn = function() {
		this.tween = {
			delay: 2000,
			childProperties: { fillColor: { saturation: 1 }, shadowColor: { alpha: 1 } },
			duration: 500,
			callback: this.lightsOff
		};
	}
	circle.lightsOff = function() {
		this.tween = {
			delay: 200,
			childProperties: { fillColor: { saturation: 0 }, shadowColor: { alpha: 0 } },
			duration: 500,
			callback: this.lightsOn
		}
	};
	
	return group;
}

var buoys = [];
for(var i = 0; i < 5; i++) {
	buoys.push(createBuoy(i+1));
	buoys[i].position = new Point((i+1)*100,(i+1)*100);
	buoys[i].halo.tween = { // Staggered signals
		delay: i * 800,
		childProperties: { fillColor: { saturation: 1 }, shadowColor: { alpha: 1 } },
		duration: 500,
		callback: buoys[i].firstChild.lightsOff
	};
}

// CONTROLS/MENUS

var controls;
var buttonWidth = Math.floor(project.view.size.width/5);
var controlWidth = buttonWidth + 20;

function createControls() {
	controlLayer.activate();
	
	controls = new Group();
	controls.preferredWidth = controlWidth;
	var controlArea = new Path.Rectangle({
		point: [project.view.size.width - controlWidth, 0],
		size: [controlWidth, project.view.size.height]
	});
	controlArea.fillColor = new Color(60/255,60/255,60/255,0.8);
	controlArea.strokeColor = null;
	//controlArea.opacity = 0.1;
	
	controls.addChild(controlArea);
	
	var goButton = createButton(
		new Point(controlArea.bounds.x + 10, controlArea.bounds.y + 10),
		"Go",
		function() {
			var decorations = spaceLayer.children["decorationGroup"];
			if (decorations) decorations.remove();
			playerShip.item.momentum = playerShip.item.momentum + playerShip.item.thrust;
			playerShip.item.thrust = new Point(0,0);
			//controlLayer.tween = {
			//	properties: { opacity: 0 },
			//	duration: 500,
			//	callback: function() {
			//		this.tween = {
			//			delay: 1500,
			//			properties: { opacity: 1 },
			//			duration: 500
			//	}
			//};
			playerShip.item.tween = {
				properties: { position: playerShip.item.position + playerShip.item.momentum },
				duration: 1000,
				cameraLock: true,
				exhaust: true,
				callback: playerShip.showDecoration
			};
			rock.tween = {
				rotation: Math.floor((Math.random()*360)-180),
				duration: 1000
			};
		}
	);
	
	controls.addChild(goButton);
	
	spaceLayer.activate();
}

createControls();

// ANIMATION

function onFrame(event) {
	animate(spaceLayer, event);
}

var controlTranslation = new Point(0,0);
var backgroundPos = new Point(0,0);

function animate(item, event) {
	if (item.tween) {
		var timeNow = new Date().getTime();
		var timeDifference = 0;
		var startTime = item.tween.startTime;

		if (startTime) {
			timeDifference = timeNow - startTime;
		} else {
			item.tween.startTime = timeNow;
			for(var property in item.tween.properties) {
				item.tween["starting" + property] = item[property];
			}
			
			for(var property in item.tween.childProperties) {
				var parentObject = item[property];
				for (var childProperty in item.tween.childProperties[property]) {
					item.tween["starting" + property + childProperty] = parentObject[childProperty];
				}
			}
			
			if (item.tween.rotation) {
				item.tween["startingrotation"] = item.lastAngle || 0;
			}
		}
		
		var duration = item.tween.duration || 1;
		var delay = item.tween.delay || 0;
		
		if (timeDifference > delay) { // Time for action
			var factor;
			if (timeDifference > (duration + delay)) factor = 1;
			else factor = (timeDifference - delay)/duration;
			if (factor > 1) factor = 1;
		
			for(var property in item.tween.properties) {
				var startingValue = item.tween["starting" + property];
				var targetValue = item.tween.properties[property];
				var currentValue = startingValue + (targetValue - startingValue) * factor;
				item[property] = currentValue;
			}
			
			for(var property in item.tween.childProperties) {
				var parentObject = item[property];
				for (var childProperty in item.tween.childProperties[property]) {
					var startingValue = item.tween["starting" + property + childProperty];
					var targetValue = item.tween.childProperties[property][childProperty];
					var currentValue = startingValue + (targetValue - startingValue) * factor;
					parentObject[childProperty] = currentValue;
				}
			}
			
			if (item.tween.rotation) {
				var startingValue = item.tween["startingrotation"];
				var targetValue = item.tween.rotation;
				//alert(startingValue + "," + targetValue);
				var deltaRotation = (targetValue - startingValue) * factor;
				//alert(deltaRotation);
				item.rotate(deltaRotation);
				item.lastAngle += deltaRotation;
			}
			
			if (item.tween.cameraLock) {
				project.view.center = item.position;
				var controlDelta = view.bounds.topLeft - controlTranslation;
				controlLayer.translate(controlDelta);
				controlTranslation += controlDelta;
				backgroundPos -= controlDelta/5;
				document.body.style.backgroundPosition = Math.round(backgroundPos.x) + "px " + Math.round(backgroundPos.y) + "px";
			}
			
			if (item.tween.exhaust) {
				if (item.lastAngle) {
					var particleCount = item.tween.particleCount || 0;
					var targetCount = Math.floor(particles.totalParticles * factor);
					for (var i = particleCount; i < (targetCount + 1); i++) {
						createParticle(item.position, item.lastAngle + 180, item.bounds.size);
					}
					item.tween.particleCount = targetCount;
				}
			}
					
			if (factor == 1) { // End animation
				var callback = item.tween.callback;
				delete item.tween;
				if (callback) {
					callback.apply(item, []);
				}
			}
		}
	}
		
	for(var i in item.children) {
		animate(item.children[i], event);
	}
}

// t: current time, b: begInnIng value, c: change In value, d: duration
var easingFunctions = { 
		easeInQuad: function (x, t, b, c, d) {
			return c*(t/=d)*t + b;
		},
		easeOutQuad: function (x, t, b, c, d) {
			return -c *(t/=d)*(t-2) + b;
		},
		easeInOutQuad: function (x, t, b, c, d) {
			if ((t/=d/2) < 1) return c/2*t*t + b;
			return -c/2 * ((--t)*(t-2) - 1) + b;
		},
		easeInCubic: function (x, t, b, c, d) {
			return c*(t/=d)*t*t + b;
		},
		easeOutCubic: function (x, t, b, c, d) {
			return c*((t=t/d-1)*t*t + 1) + b;
		},
		easeInOutCubic: function (x, t, b, c, d) {
			if ((t/=d/2) < 1) return c/2*t*t*t + b;
			return c/2*((t-=2)*t*t + 2) + b;
		},
		easeInQuart: function (x, t, b, c, d) {
			return c*(t/=d)*t*t*t + b;
		},
		easeOutQuart: function (x, t, b, c, d) {
			return -c * ((t=t/d-1)*t*t*t - 1) + b;
		},
		easeInOutQuart: function (x, t, b, c, d) {
			if ((t/=d/2) < 1) return c/2*t*t*t*t + b;
			return -c/2 * ((t-=2)*t*t*t - 2) + b;
		},
		easeInQuint: function (x, t, b, c, d) {
			return c*(t/=d)*t*t*t*t + b;
		},
		easeOutQuint: function (x, t, b, c, d) {
			return c*((t=t/d-1)*t*t*t*t + 1) + b;
		},
		easeInOutQuint: function (x, t, b, c, d) {
			if ((t/=d/2) < 1) return c/2*t*t*t*t*t + b;
			return c/2*((t-=2)*t*t*t*t + 2) + b;
		},
		easeInSine: function (x, t, b, c, d) {
			return -c * Math.cos(t/d * (Math.PI/2)) + c + b;
		},
		easeOutSine: function (x, t, b, c, d) {
			return c * Math.sin(t/d * (Math.PI/2)) + b;
		},
		easeInOutSine: function (x, t, b, c, d) {
			return -c/2 * (Math.cos(Math.PI*t/d) - 1) + b;
		},
		easeInExpo: function (x, t, b, c, d) {
			return (t==0) ? b : c * Math.pow(2, 10 * (t/d - 1)) + b;
		},
		easeOutExpo: function (x, t, b, c, d) {
			return (t==d) ? b+c : c * (-Math.pow(2, -10 * t/d) + 1) + b;
		},
		easeInOutExpo: function (x, t, b, c, d) {
			if (t==0) return b;
			if (t==d) return b+c;
			if ((t/=d/2) < 1) return c/2 * Math.pow(2, 10 * (t - 1)) + b;
			return c/2 * (-Math.pow(2, -10 * --t) + 2) + b;
		},
		easeInCirc: function (x, t, b, c, d) {
			return -c * (Math.sqrt(1 - (t/=d)*t) - 1) + b;
		},
		easeOutCirc: function (x, t, b, c, d) {
			return c * Math.sqrt(1 - (t=t/d-1)*t) + b;
		},
		easeInOutCirc: function (x, t, b, c, d) {
			if ((t/=d/2) < 1) return -c/2 * (Math.sqrt(1 - t*t) - 1) + b;
			return c/2 * (Math.sqrt(1 - (t-=2)*t) + 1) + b;
		},/*
		easeInElastic: function (x, t, b, c, d) { //broken
			var s=1.70158;var p=0;var a=c;
			if (t==0) return b;  if ((t/=d)==1) return b+c;  if (!p) p=d*.3;
			if (a < Math.abs(c)) { a=c; var s=p/4; }
			else var s = p/(2*Math.PI) * Math.asin (c/a);
			return -(a*Math.pow(2,10*(t-=1)) * Math.sin( (t*d-s)*(2*Math.PI)/p )) + b;
		},*/
		easeOutElastic: function (x, t, b, c, d) {
			var s=1.70158;var p=0;var a=c;
			if (t==0) return b;  if ((t/=d)==1) return b+c;  if (!p) p=d*.3;
			if (a < Math.abs(c)) { a=c; var s=p/4; }
			else var s = p/(2*Math.PI) * Math.asin (c/a);
			return a*Math.pow(2,-10*t) * Math.sin( (t*d-s)*(2*Math.PI)/p ) + c + b;
		},/*
		easeInOutElastic: function (x, t, b, c, d) {
			var s=1.70158;var p=0;var a=c;
			if (t==0) return b;  if ((t/=d/2)==2) return b+c;  if (!p) p=d*(.3*1.5);
			if (a < Math.abs(c)) { a=c; var s=p/4; }
			else var s = p/(2*Math.PI) * Math.asin (c/a);
			if (t < 1) return -.5*(a*Math.pow(2,10*(t-=1)) * Math.sin( (t*d-s)*(2*Math.PI)/p )) + b;
			return a*Math.pow(2,-10*(t-=1)) * Math.sin( (t*d-s)*(2*Math.PI)/p )*.5 + c + b;
		},*/
		easeInBack: function (x, t, b, c, d, s) {
			if (s == undefined) s = 1.70158;
			return c*(t/=d)*t*((s+1)*t - s) + b;
		},
		easeOutBack: function (x, t, b, c, d, s) {
			if (s == undefined) s = 1.70158;
			return c*((t=t/d-1)*t*((s+1)*t + s) + 1) + b;
		},
		easeInOutBack: function (x, t, b, c, d, s) {
			if (s == undefined) s = 1.70158; 
			if ((t/=d/2) < 1) return c/2*(t*t*(((s*=(1.525))+1)*t - s)) + b;
			return c/2*((t-=2)*t*(((s*=(1.525))+1)*t + s) + 2) + b;
		},
		easeInBounce: function (x, t, b, c, d) {
			return c - this.easeOutBounce(x, d-t, 0, c, d) + b;
		},/*
		easeOutBounce: function (x, t, b, c, d) {
			if ((t/=d) < (1/2.75)) {
				return c*(7.5625*t*t) + b;
			} else if (t < (2/2.75)) {
				return c*(7.5625*(t-=(1.5/2.75))*t + .75) + b;
			} else if (t < (2.5/2.75)) {
				return c*(7.5625*(t-=(2.25/2.75))*t + .9375) + b;
			} else {
				return c*(7.5625*(t-=(2.625/2.75))*t + .984375) + b;
			}
		},*/
		easeInOutBounce: function (x, t, b, c, d) {
			if (t < d/2) return this.easeInBounce(x, t*2, 0, c, d) * .5 + b;
			return this.easeOutBounce(x, t*2-d, 0, c, d) * .5 + c*.5 + b;
		}
};

/*
 *
 * TERMS OF USE - EASING EQUATIONS
 * 
 * Open source under the BSD License. 
 * 
 * Copyright Â© 2001 Robert Penner
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without modification, 
 * are permitted provided that the following conditions are met:
 * 
 * Redistributions of source code must retain the above copyright notice, this list of 
 * conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright notice, this list 
 * of conditions and the following disclaimer in the documentation and/or other materials 
 * provided with the distribution.
 * 
 * Neither the name of the author nor the names of contributors may be used to endorse 
 * or promote products derived from this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY 
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 *  COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 *  EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE
 *  GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED 
 * AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 *  NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED 
 * OF THE POSSIBILITY OF SUCH DAMAGE. 
 *
 */

function createParticle(position, exhaustAngle, size) {
	var particleSize = randomInt(particles.size, particles.sizeRandom);
	var particle = new Path.Rectangle({
		point: new Point(0,0),
		size: new Size(particleSize,particleSize),
		fillColor: "white",
		shadowColor: "white",
		shadowBlur: 10,
		strokeColor: undefined
	});
	particle.fillColor.alpha = randomInt(95, 10)/100;
	
	var toCorner = new Point({angle: exhaustAngle, length: new Point(size.width, size.height).length/2 });
	var spread = new Point({ length: randomInt(25, 50), angle: randomInt(exhaustAngle, particles.angleRandom) });
	particle.position = position + toCorner + spread;
	
	var speed = randomInt(particles.speed, particles.speedRandom);
	var lifeSpan = randomInt(particles.lifeSpan, particles.lifeSpanRandom);
	var endPosition = particle.position + new Point({
		length: speed*lifeSpan/100,
		angle: randomInt(exhaustAngle, particles.angleRandom)
	});
	particle.tween = {
		properties: { position: endPosition },
		childProperties: {
			fillColor: { alpha: 0, red: 89/255, green: 155/255, blue: 179/255 },
			shadowColor: { alpha: 0, red: 89/255, green: 155/255, blue: 179/255 }
		},
		duration: lifeSpan,
		callback: particle.remove
	};
}

var particles = {
	// Random spread from origin
	spread: 10,
	//
	totalParticles: 25,
	size: 6,
	sizeRandom: 2,
	speed: 20,
	speedRandom: 2,
	// Lifespan in ms
	lifeSpan: 800,
	lifeSpanRandom: 200,
	//angle: 0,
	angleRandom: 5,
	startColor: [0, 200, 255, 1], // startColour: [255, 131, 0, 1],
	startColorRandom: [48, 50, 45, 0],
	endColor: [0, 100, 245, 0],
	endColorRandom: [60, 60, 60, 0],
	// Only applies when fastMode is off, specifies how sharp the gradients are drawn
	//sharpness: 20,
	//sharpnessRandom: 10,
}

//animate(spaceLayer);

//project.activeLayer.scale(2, ship.position);

// UTILS

function createButton(point, label, clickFunction) {
	var button = new Path.Rectangle({
		point: point,
		size: [buttonWidth, 40],
		fillColor: {
			gradient: {
				stops: [['#599bb3', 0.05], ['307c89', 1]]
			},
			origin: point,
			destination: point + new Point(0,40)
		},
		strokeColor: undefined,
		shadowColor: "#276873",
		shadowBlur: 20
	});
	
	var text = new PointText(point);
	text.style = {
		fillColor: "white",
		strokeColor: "white",
		strokeWidth: 1
	};
	text.content = label;
	text.position = button.bounds.center;
	button.addChild(text);
	
	button.previousClickTime = 0;
	button.on({
		click: function() {
			var timeNow = new Date().getTime();
			if ((timeNow - this.previousClickTime) < 500) return;
			this.previousClickTime = timeNow;
			clickFunction();
		}
	});
	
	return button;
}

function createArrow(start, arrow) {
	var end = start + arrow;
	var right = arrow.clone();
	right.length = 5;
	right.angle += 135;
	var left = right.clone();
	left.angle += 90;
	right = end + right;
	left = end + left;
	var path = new Path(start, end, right, left, end);
	return path;
}

function randomInt(base, range) {
	return Math.round(base + Math.random()*range - range/2);
}

// Capture top mouse moves to prevent canvas moving on iOS
function onMouseMove(event) {}

