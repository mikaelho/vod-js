var playField = randomScramble;

var steps = 3,
	stepDuration = 2000,
	stepSeconds = stepDuration / 1000,
	totalDuration = steps * stepDuration,
	totalSeconds = steps * stepSeconds;

var physics = new Physics(); 
physics.collision();
physics.showDebug = false;

var models = {
	suicidePod: {
		pathProperties: {
			//segments: [[0,6],[3,3],[3,0],[6,3],[15,3],[18,6],[18,9],[15,12],[6,12],[3,15],[3,12],[0,9]],
			segments: [[0,12],[6,6],[6,0],[12,6],[30,6],[36,12],[36,18],[30,24],[12,24],[6,30],[6,24],[0,18]],
			fillColor: "black",
			strokeColor: "white",
			strokeWidth: 2,
			shadowColor: "cyan",
			shadowBlur: 20,
			closed: true
		},
		name: "Suicide Pod",
		description: "Once it was a top-of-the-line escape pod. Now it is unreliable but cheap.<br>The pod is equipped with a much too big engine for its size, and little in the way of weapons or defences, but those saying that it has no offensive capability are looking at the wrong end of the pod.",
		power: 100,
		maxHealth: 100,
		mass: 100
	}
};

var game = {

	spaceObjects: [],
	ships: [],
	
	turn: -1,
	thrusts: [],
	
	currentScale: 1,
	zoomedOut: true,
	calculating: false,
	
	players: [
		{
			name: "Enterprise",
			ship: models.suicidePod,
			color: "cyan"
		},
		{
			name: "Ultramarine",
			ship: models.suicidePod,
			color: "magenta"
		}/*,
		{
			name: "Mikael",
			ship: models.suicidePod,
			color: "lightGreen"
		}/*,
		{
			name: "Player 4",
			ship: models.suicidePod,
			color: "yellow"
		}*/
	],
	leader: 0,
	winners: [],

	progress: function() {
		$("#okbutton").transition({ right: "-100px"}, 2000);
		if (this.winners.length > 0) {
			var dialogText = "Winner" + (this.winners.length > 1 ? "s" : "") + "<br/><br/>";
			for(var i in this.winners) {
				if (this.winners.length > 1) {
					dialogText += (parseInt(i) + 1) + ". ";
				}
				dialogText += this.winners[i] + "<br/>";
			}
			this.showDialog(dialogText, false);
		} else if (this.thrusts.length == this.players.length) {
			this.showDialog("Ready for results", true);
		} else {
			this.turn = (this.turn + 1) % this.players.length;
			var dialogText = "Player: " + this.players[this.turn].name;
			gap = this.leader - this.ships[this.turn].buoysVisited;
			if (gap > 0) {
				gap *= 25;
				dialogText += "<br/><br/>Underdog advantage " + gap + "%";
			}
			this.ships[this.turn].gap = gap;
			this.showDialog(dialogText, false);
			
		}
	},
	
	showDialog: function(message, endRound) {
		$("#hud").css({ visibility: "hidden" });
		$("#dialogbackground").css({ opacity: 0, display: "block" });
		$("#dialogbackground").transition({ opacity: 0.8 }, 1000);
		if (endRound) {
			simulate();
		} else {
			$("#dialog").html(message);
		}
	},
	
	hideDialog: function() {
		$("#dialogbackground").css({display: "none"});
		if (this.thrusts.length == this.players.length) {
			this.startOneRound();
		} else {
			this.thrusts.push([new paper.Point(0,0), new paper.Point(0,0), new paper.Point(0,0)]); 
			this.displayHud();
			$("#hud").css({ visibility: "visible" });
			$("#okbutton").transition({ right: "-1px"}, 2000);
		}
	},
	
	displayHud: function() {
		paper.project = game.hudLayer;
		game.hudLayer.activeLayer.removeChildren();
		var radius = 30;
		var thickness = 10;
		var lineRadius = radius + thickness;
		//var indicators = paper.project.activeLayer.children;
		var drawCircle = function(circleName, color, border) {
			var circle = new paper.Shape.Circle([0,0], radius);
			var fillColor = new paper.Color(color);
			fillColor.alpha = 0.1;
			circle.fillColor = fillColor;
			var borderColor = new paper.Color(color);
			borderColor.alpha = border ? 0.9 : 0.05;
			circle.strokeColor = borderColor;
			circle.strokeWidth = border ? 2 : 5;
			circle.name = circleName;
		};
		var drawPath = function(pathName, color) {
			var lineColor = new paper.Color(color);
			lineColor.alpha = 0.9;
			var path = new paper.Path({
				segments: [[0,0], [1,1]],
				name: pathName,
				strokeColor: lineColor,
				strokeWidth: 2
			});
		};
		var drawSector = function(center, fromAngle, toAngle, color, filled) {
			var sector = new paper.Path();
			sector.strokeColor = color;
			sector.strokeWidth = 2;
			var fillColor = new paper.Color(color);
			fillColor.alpha = 0.8;
			if (filled) sector.fillColor = fillColor;
			var startPoint = new paper.Point({
				length: radius,
				angle: fromAngle });
			var midPoint = new paper.Point({
				length: radius,
				angle: (toAngle - fromAngle)/2 + fromAngle });
			var endPoint = new paper.Point({
				length: radius,
				angle: toAngle });
			sector.moveTo(center.add(startPoint))
			sector.arcTo(center.add(midPoint), center.add(endPoint));
			startPoint.length = midPoint.length = endPoint.length = radius + thickness;
			sector.lineTo(center.add(endPoint));
			sector.arcTo(center.add(midPoint), center.add(startPoint));
			//startPoint.length = radius;
			//sector.lineTo(startPoint);
			sector.closed = true;
		};
		var drawArrow = function(start, vector, size) {
			var arrowHeadSize = size ? size : 10;
			var right = vector.clone();
			right.length = arrowHeadSize;
			right.angle += 135;
			var left = right.clone();
			left.angle += 90;
			var arrow = new paper.Path({
				segments: [
					start, 
					start.add(vector),
					start.add(vector).add(right),
					start.add(vector),
					start.add(vector).add(left)
				]
			});
			return arrow;
		};
		
		// Show rock movement vectors
		inSpace(function(o) {
			if (o.isA(rock)) {
				var velocity = o.body.GetLinearVelocity();
				var directionVector = new paper.Point(velocity.x, velocity.y);
				directionVector.length = 50;
				var directionArrow = drawArrow(o.position, directionVector);
				directionArrow.style = {
					strokeColor: "grey", strokeWidth: 2
				};
			}
		});
		
	
		for(var i = 0; i < game.players.length; i++) {
		
			var color = game.players[i].color;
			//drawCircle("player"+i, true, true);
			
			// Player names
			var tagColor = new paper.Color(color);
			tagColor.alpha = 0.7;
			var nameTag = new paper.PointText([0,0]);
			nameTag.name = "tag"+i;
			nameTag.content = game.players[i].name;
			nameTag.style = {
				font: "Optima-ExtraBlack",
				fontSize: 20,
				strokeWidth: 1,
				//strokeColor: new paper.Color(0.9,0.7,0.7),
				fillColor: tagColor
			};
			var tagPosition = game.ships[i].position.subtract(new paper.Point(0, radius)); //circle.strokeBounds.topCenter;
			tagPosition.y = tagPosition.y - nameTag.bounds.height;
			nameTag.position = tagPosition;
			
			var counterAngle = 90 / playField.numBuoys;
			for (var j = 0; j < playField.numBuoys; j++) {
				drawSector(game.ships[i].position, 135 + j*counterAngle, 135+(j+1)*counterAngle, color, 
					(j < game.ships[i].buoysVisited));
			}
			
			if (game.ships[i].health == game.ships[i].maxHealth) {
				drawSector(game.ships[i].position, 315, 405, color, true);
			} else {
				var lostFraction = 1 - (game.ships[i].health / game.ships[i].maxHealth);
				var healthColor = lostFraction > 0.75 ? "red" : color;
				drawSector(game.ships[i].position, 315, 315 + lostFraction * 90, color, false);
				drawSector(game.ships[i].position, 315 + lostFraction * 90, 405, healthColor, true);
			}
		}
		
		var color = game.players[game.turn].color;
		drawCircle("range1", color, false);
		drawCircle("range2", color, false);
		drawCircle("activeRange", color, false);
		
		for (var i = 0; i < 3; i++) {
			drawPath("path" + i, color);
		}
		
		//drawCircle("current", false, true);
		drawCircle("positionrange1", color, true);
		drawCircle("positionrange2", color, true);
		drawCircle("positionactiveRange", color, true);
		
		this.displayThrusts();
	},
	
	displayThrusts: function() {
		//paper.project = game.hudLayer;
		var active = 2;
		var radius = 30;
		var thickness = 10;
		var lineRadius = radius + thickness;
		var currentShip = game.ships[game.turn];
		var indicators = paper.project.activeLayer.children;
		var currentPosition = currentShip.position;
		//indicators["current"].position = currentPosition;
		//indicators["current"].strokeColor = game.players[game.turn].color;
		var currentMomentum = currentShip.momentum;
		var rangeArray = ["range1", "range2"];
		var positionArray = ["positionrange1", "positionrange2"];
		rangeArray.splice(active, 0, "activeRange");
		positionArray.splice(active, 0, "positionactiveRange");
		currentShip.effectivePower = currentShip.power * (100 + currentShip.gap) / 100;
		for(var i = 0; i < 3; i++) {
			var previousPosition = currentPosition;
			currentPosition = currentPosition.add(currentMomentum);
			indicators[rangeArray[i]].position = currentPosition;
			indicators[rangeArray[i]].radius = currentShip.effectivePower;
			indicators[rangeArray[i]].thrustIndex = i;
			currentMomentum = currentMomentum.add(game.thrusts[game.turn][i]);
			currentPosition = currentPosition.add(game.thrusts[game.turn][i]);
			indicators[positionArray[i]].position = currentPosition;
			indicators[positionArray[i]].thrustIndex = i;
			var radiusPath = currentPosition.subtract(previousPosition);
			var connection = indicators["path"+i];
			if (radiusPath.length < (lineRadius * 2)) {
				connection.visible = false;
			} else {
				radiusPath.length = lineRadius;
				connection.visible = true;
				connection.segments =
					[previousPosition.add(radiusPath), currentPosition.subtract(radiusPath)];
			}
		}
		paper.project.view.draw();
	},
	
	moveThrusts: function(item, position) {
		var itemName = item.name;
		var index = item.thrustIndex;
		var prefix = "position";
		if (itemName.indexOf(prefix) == 0) {
			itemName = itemName.substring(prefix.length);
		} 
		var rangeItem = game.hudLayer.activeLayer.children[itemName];
		var ship = game.ships[game.turn];
		var thrust = position.subtract(rangeItem.position);
		if (thrust.length > ship.effectivePower) thrust.length = ship.effectivePower;
		game.thrusts[game.turn][index] = thrust;
		game.displayThrusts();
	},
	
	roundcounter: 0,
	startOneRound: function() {
		game.roundcounter++;
		initGameLoop();
		//simulate();
	},
	
	endOneRound: function() {
		game.thrusts = [];
		for(var i in game.ships) {
			var b2Velo = game.ships[i].body.GetLinearVelocity();
			var velo = new paper.Point(b2Velo.x, b2Velo.y);
			game.ships[i].momentum = velo.multiply(stepSeconds * physics.scale);
		}
		$("#okbutton").transition({ right: "-1px"}, 2000);
	},
	
	updateScale: function() {
		inSpace(function(o) { o.updateScale(); });
	}
};

$(document).ready(function() {
	//alert("syntax check ok");
	//var state = localStorage.getItem("state");
	//localStorage.setItem("state", "initial");
	//paper.setup("paperCanvas");
	//$("#spaceobjects").width($("#paperCanvas").width()).height($("#paperCanvas").height());
	//$("#spaceevents").width($("#paperCanvas").width()).height($("#paperCanvas").height());
	//$("#thrusts").width($(window).width()).height($(window).height());
    
    //game.currentScale = 0.5;
	physics.debug();
	paper.setup($("#hud")[0]);
	game.hudLayer = paper.project;
	//createHudElements();
	
	playField.initialize();
	startMovement();
	setZoomTo(playField.bounds);
	setEvents();
	physics.updateDisplay();
	
	game.progress();
	
	//paper.project.view.draw();
	//rAF(gameLoop);

	//game.animateIntro(playField.shipIntro);
	//zoomTo(playField.bounds, function() { game.animateIntro(playField.shipIntro); });
	//zoomTo(playField.bounds, playField.shipIntro);
	//rAF(beforePaint);
	
	//setEvents();
});

var lastFrame = startTime = diff = 0, roundTimer = 0, lastModulo = 1, run = true, thrustNext = false;

function initGameLoop() {
	lastFrame = startTime = 0;
	roundTimer = 0;
	diff = 0;
	lastModulo = 1000;
	run = true;
	thrustNext = false;
	for(var i in paperManager.activeProjects) {
		var v = paperManager.activeProjects[i].view;
		v.zoom = game.hudLayer.view.zoom;
		v.center = game.hudLayer.view.center;
	}
	rAF(gameLoop);
}

window.gameLoop = function(currentTime) {
	//diff = new Date().getTime() - startTime;
	if (startTime == 0) {
		startTime = currentTime;
	}
	diff = currentTime - startTime;
	//dbg(diff);
	if (diff < totalDuration) {
		rAF(gameLoop);
		inSpace(function(o) {
			while(o.queue.length  > 0 && o.queue[0].time < diff) {
				var doer = o.queue.shift();
				doer.do(diff);
			}
		});
		while(game.effectQueue.length  > 0 && game.effectQueue[0].time < diff) {
			var doer = game.effectQueue.shift();
			doer.do(diff);
		}
	} else {
		inSpace(function(o) {
			while(o.queue.length > 0) {
				var doer = o.queue.shift();
				doer.do(diff);
			}
		});
		while(game.effectQueue.length > 0) {
			var doer = game.effectQueue.shift();
			doer.do(diff);
		}
		game.endOneRound();
	}

}

/*
window.gameLoop = function() {
	var tm = new Date().getTime();
	if (run) {
		rAF(gameLoop);
	} else {
		game.endOneRound();
	}
	var dt = (tm - lastFrame) / 1000;
	if (dt > 1/15) { dt = 1/15; }
	diff += dt * 1000;
	var step = Math.round(diff / stepDuration);
	if (diff % stepDuration < lastModulo) {
		if (step < 3) {
			thrustNext = true;
			for(var i in game.ships) {
				var thrust = game.thrusts[i][step];
				var body = game.ships[i].body;
				if (thrust.length > 0) {
					body.SetAngle(degToRad(thrust.angle));
				}
			}
		} else {
			run = false;
		}
	}
	lastModulo = diff % stepDuration;
	if (thrustNext) {
		thrustNext = false;
		for(var i in game.ships) {
			var thrust = game.thrusts[i][step];
			var body = game.ships[i].body;
			var impulse = 
				game.thrusts[i][step].divide(physics.scale*stepSeconds).multiply(body.GetMass());
			body.ApplyImpulse(impulse, body.GetWorldCenter());
			
			for (var j = 0; j < 2; j++) {
				var p = Object.create(particle);
				p.setUp(game.ships[i], game.thrusts[i][step], game.players[i].color);
			}
		}
	}
	//debugTimer += dt;
	//dbg(debugTimer);
	physics.step(dt);
	lastFrame = tm;
};
*/

window.simulate = function() {
	game.calculating = true;
	game.simulationTime = 0;
	lastModulo = 1000;
	inSpace(function(o) { o.queue = []; });
	game.effectQueue = [];
	paperManager.releaseProjects();
	setTimeout(simulateLoop, 0);
}

window.simulateLoop = function() {
	var dt = 1/15;
	game.simulationTime += dt;
	var tt = game.simulationTime;
	var step = Math.round(tt / stepSeconds);
	$("#dialog").html("Calculating<br/>" + Math.round(tt/totalSeconds*100) + "%");
	if (tt % stepSeconds < lastModulo) {
		if (step < steps) {
			//cleanParticles();
			shipsThrust(step);
			rocksAvoidEdges();
		}
		if (step == steps) {
			inSpace(function(o) { o.last = true; });
			//cleanParticles();
		}
	}
	lastModulo = tt % stepSeconds
	physics.step(dt);
	
	if (game.simulationTime < totalSeconds) {
		//checkConditions();
		setTimeout(simulateLoop, 0);
	} else {
		endSimulation();
	}
}

/**
function cleanParticles() {
	inSpace(function(o) {
		if (o.isA(particle)) {
			o.removeParticle();
		}
	});
}
**/

function shipsThrust(step) {
	for(var i in game.ships) {
		var thrust = game.thrusts[i][step];
		if (thrust.length > 0) {
			game.ships[i].thrusting = true;
			var body = game.ships[i].body;
			body.SetAngle(degToRad(thrust.angle));
			var impulse = 
				game.thrusts[i][step].divide(physics.scale*stepSeconds).multiply(body.GetMass());
			body.ApplyImpulse(impulse, body.GetWorldCenter());
			flame(game.ships[i], game.thrusts[i][step], impulse, game.players[i].color);
			/*
			for (var j = 0; j < 10; j++) {
				var p = Object.create(particle);
				p.setUp(game.ships[i], game.thrusts[i][step], game.players[i].color);
				game.spaceObjects.push(p);
				p.first = true;
				p.queue.push({
					time: game.simulationTime * 1000,
					target: p,
					do: function(currentTime) {
						this.target.div.css({ visibility: "visible" });
					}
				});
			}
			*/
		}
	}
}

function flame(generator, impulse, b2impulse, color) {
	paperManager.activateProject();
	var flameVector = new paper.Point({
		length: impulse.length,
		angle: impulse.angle - 180
	});
	var outline = new paper.Path();
	//outline.strokeColor = color;
	
	var generationPoint = new paper.Point(10,10);
	var b = generator.outerPath.strokeBounds;
	generationPoint.length =
		Math.sqrt(b.width*b.width + b.height*b.height)/2;
	generationPoint.angle = flameVector.angle;
	generationPoint = generationPoint.add(generator.position);

	var l = flameVector.length/100*2;

	outline.moveTo(generationPoint.add(new paper.Point(5, -5).multiply(l)));
	outline.arcBy([25*l, -15*l], [55*l, 0]);
	outline.lineBy(40*l, 5*l);
	outline.lineBy(-40*l, 5*l);
	outline.arcBy([-30*l, 15*l], [-55*l, 0]);
	outline.rotate(flameVector.angle, generationPoint);
	
	var startColor = "white";
	var endColor = new paper.Color(color);
	endColor.alpha = 0.2;
	var rayCatcher = {};
	var rayCatch = function(fixture, hitPoint, normal, fraction) {
		rayCatcher.body = fixture.GetBody();
		rayCatcher.spaceObject = rayCatcher.body.GetUserData();
		if (rayCatcher.spaceObject.isA(buoy)) return 1;
		rayCatcher.hit = true;
		rayCatcher.b2point = hitPoint;
		rayCatcher.point = new paper.Point(hitPoint.x * physics.scale, hitPoint.y * physics.scale);
		return fraction;
	};
	var impulsePortion = flameVector.divide(physics.scale).divide(50);
	for(var i = 0; i <= outline.length; i += (outline.length/50)) {
		var endPoint = outline.getPointAt(i);
		var gradientEnd = endPoint;
		rayCatcher.hit = false;
		physics.world.RayCast(
			rayCatch, 
			generationPoint.divide(physics.scale),
			endPoint.divide(physics.scale)
		);
		if (rayCatcher.hit) {
			endPoint = rayCatcher.point;
			rayCatcher.body.ApplyImpulse(impulsePortion, rayCatcher.b2point);
			if (rayCatcher.spaceObject.isA(ship)) {
				var shipHit = rayCatcher.spaceObject;
				var paperImpact = new paper.Point(impulsePortion.x, impulsePortion.y);
				shipHit.damage(paperImpact.multiply(6));
				//ship.health = ship.health - Math.min(paperImpact.length * 6, ship.health);
			}
			rayCatcher.spaceObject.thrusting = true;
		}
		var radiate = new paper.Path(generationPoint, endPoint);
		radiate.strokeColor = {
			gradient: {
				stops: [startColor, endColor]
			},
			origin: generationPoint,
			destination: gradientEnd
		};
	}
	paper.project.view.draw();
	var flameShift = new paper.Point(flameVector);
	flameShift.length = 10;
	game.effectQueue.push({
		time: game.simulationTime * 1000,
		left: flameShift.x,
		top: flameShift.y,
		view: paper.project.view,
		$canvas: $(paper.project.view.element),
		do: function(currentTime) {
			this.$canvas.css({ left: 0, top: 0, opacity: 1 });
			this.$canvas.transition({ left: this.left, top: this.top, opacity: 0}, 500);
		}
	});
}

function rocksAvoidEdges() {
	var boundaryDistance = Math.min(playField.bounds.width, playField.bounds.height)/2;
	inSpace(function(o) {
		if (o.isA(rock)) {
			var centerVector = playField.bounds.center.subtract(o.position);
			if (centerVector.length > boundaryDistance) {
				//var currentVelocity = o.body.GetLinearVelocity();
				//var impulse = new paper.Point(currentVelocity.x, currentVelocity.y);
				//impulse.angle = centerVector.angle;
				centerVector.length = 5;
				var impulse =
					centerVector.divide(physics.scale*stepSeconds).multiply(o.body.GetMass());
				o.body.ApplyImpulse(impulse, o.body.GetWorldCenter());
				o.thrusting = true;
			}
		}
	});
}

function checkConditions() {
	inSpace(function(o) {
		if (o.isA(ship) && o.destroyed) {
			o.destroyed = false;
			alert("destroyed");
		}
	});
}

function endSimulation() {
	//var dbgStr = "";
	//inSpace(function (o) { dbgStr += o.printQueue(); });
	//dbg(dbgStr);
	$("#dialog").html("Ready for results");
	//cleanParticles();
	game.calculating = false;
}

function startMovement() {
	inSpace(function(o) { 
		o.body.ApplyImpulse(
			o.momentum.divide(physics.scale * stepSeconds).multiply(o.body.GetMass()), o.body.GetWorldCenter());
		o.body.SetAngularVelocity(degToRad(o.rotationSpeed));
	});
}

var paperManager = {
	activeProjects: [],
	inactiveProjects: [],
	allProjects: [],
	
	activateProject: function() {
		var prj;
		if (this.inactiveProjects.length > 0) {
			prj = this.inactiveProjects.pop();
			paper.project = prj;
		} else {
			var $hud = $("#hud");
			var $canvas = 
				$('<canvas/>',{'id':'flame'+this.allProjects.length, 'class':'flames'})
				.attr('width', $hud.attr('width')) // Set drawing area size (element property)
				.attr('height', $hud.attr('height'))
				.width($hud.width()) // Set visible size (CSS)
				.height($hud.height());
			$canvas.css({ position: "absolute",
				top: 0, left: 0, marginLeft: 0, marginTop: 0, width: "100%", height: "100%"
				//visibility: "hidden"
				//backgroundColor: "red"
			});
			$("#viewport").append($canvas);
			paper.setup($canvas[0]);
			$canvas.css({opacity: 0});
			prj = paper.project;
			prj.view.zoom = game.hudLayer.view.zoom;
			prj.view.center = game.hudLayer.view.center;
			this.allProjects.push(prj);
		}
		this.activeProjects.push(prj);
	},
	
	releaseProjects: function() {
		for(var i = 0; i < this.activeProjects.length; i++) {
			var prj = this.activeProjects[i];
			prj.activeLayer.removeChildren();
			this.inactiveProjects.push(prj);
		}
		this.activeProjects = [];
	}
}

function createHudElements() {
	//paper.project = game.hudLayer;
	var drawCircle = function(circleName, active, border) {
		var circle = new paper.Shape.Circle([0,0], 30);
		circle.fillColor = active ? new paper.Color(0.9,0.3,0.3,0.1) : new paper.Color(0.9,0.7,0.7,0.1);
		circle.strokeColor =
			border ? (active ? new paper.Color(0.9,0.3,0.3,0.9) : new paper.Color(0.9,0.7,0.7,0.9)) :
			(active ? new paper.Color(0.9,0.3,0.3,0.05) : new paper.Color(0.9,0.7,0.7,0.05));
		circle.strokeWidth = border ? 2 : 5;
		circle.name = circleName;
	};
	var drawPath = function(pathName) {
		var path = new paper.Path({
			segments: [[0,0], [1,1]],
			name: pathName,
			strokeColor: new paper.Color(0.9,0.7,0.7),
			strokeWidth: 2
		});
	};
	
	for(var i = 0; i < game.players.length; i++) {
		drawCircle("player"+i, true, true);
		var nameTag = new paper.PointText([0,0]);
		nameTag.name = "tag"+i;
		nameTag.content = game.players[i].name;
		nameTag.style = {
			font: "Optima-ExtraBlack",
			fontSize: 20,
			strokeWidth: 1,
			//strokeColor: new paper.Color(0.9,0.7,0.7),
			fillColor: new paper.Color(0.9,0.7,0.7,0.7)
		};
		for (var j = 0; j < playField.numBuoys; j++) {
			var counter = new paper.Shape.Circle([0,0], 5);
			counter.strokeColor = new paper.Color(0.9,0.7,0.7,0.9);
			counter.name = "counter" + i + "-" + j;
		}
	}
	
	drawCircle("range1", false, false);
	drawCircle("range2", false, false);
	drawCircle("activeRange", true, false);
	
	for (var i = 0; i < 3; i++) {
		drawPath("path" + i);
	}
	
	//drawCircle("current", false, true);
	drawCircle("positionrange1", false, true);
	drawCircle("positionrange2", false, true);
	drawCircle("positionactiveRange", false, true);
}

var spaceObject = {
	
	isA: function(o) {
		var here = this;
		while(here.__proto__) {
			if (here.__proto__ === o) return true;
			here = here.__proto__;
		}
		return false;
	},
	
	extend: function(o) {
		for(var key in o) {
			if(o.hasOwnProperty(key)) {
				this[key] = o[key];
			}
		}
		return this;
	},
	
	createElements: function(bounds) {
		var b = bounds;
		var $div =
			$('<div/>', {'id':this.id(), 'class':'spaceobject'})
			.width(b.width) // Set visible size (CSS)
			.height(b.height);
		$div.css({ position: "absolute",
			marginLeft: 0, marginTop: 0,
			top: b.y, left: b.x
			//, backgroundColor: "rgba(255,255,255,0.1)"
			//, border: "1px solid #ffffff"
		});
		
		var $canvas = 
			$('<canvas/>',{'id':'canvas'+this.id()})
			.attr('width', b.width) // Set drawing area size (element property)
			.attr('height', b.height)
			.width(b.width) // Set visible size (CSS)
			.height(b.height);
		$canvas.css({ //position: "absolute",
			marginLeft: 0, marginTop: 0, width: "100%", height: "100%"
			//top: canvasPosition.y, left: canvasPosition.x
			//top: 0, left: 0
			//, backgroundColor: "rgba(0,0,255,0.1)"
			//, border: "1px solid #ffffff"
		});
		
		$div.append($canvas);
		$("#spaceobjects").append($div);
		
		this.div = $div;
		this.canvas = $canvas;
		
		paper.setup($canvas[0]);
		this.project = paper.project;
	},
	
	updateScale: function(obj) {
		var $canvas = $("#" + 'canvas'+this.id());
		//$canvas.css({scale: 1 / game.currentScale});
		$canvas
			.attr('width', this.elementBounds.width * game.currentScale) // Set drawing area size (element property)
			.attr('height', this.elementBounds.height * game.currentScale);
		this.project.view.viewSize = [
			this.elementBounds.width * game.currentScale,
			this.elementBounds.height * game.currentScale
		];
		this.project.view.zoom = game.currentScale;
		this.project.view.center = this.path.bounds.center;
	},
	
	id: function() {
		return this.spaceid;
	},
	
	setUp: function(position, data) {
		this.spaceid = "vod" + game.spaceObjects.length;
		this.momentum = this.angularMomentum = new paper.Point(0,0);
		this.rotationSpeed = 0;
		
		this.initialize(position, data);
		
		this.position = position;
		this.createBox2dBody();
		this.body = this.box2dBody.body;
		//this.project.view.draw();
		return this;
	},
	
	createBox2dBody: function() {
		var origin = paperToBox2D(this.position);
		this.box2dBody = new Body(physics, {
			shape: "polygon",
			points: GrahamScan.execute(this.outerPath.segments, this.outerPath.bounds.center, physics.scale),
			x: origin.x, y: origin.y }, this);
	},
	
	update: function(position, angle) {
		this.position = new paper.Point(position.x * physics.scale, position.y * physics.scale);
		var cornerPos = this.position.subtract([this.div.width()/2,this.div.height()/2]);
		this.div.css({ left: cornerPos.x, top: cornerPos.y });
		
		this.canvas.css({ rotate: angle });
		this.angle = angle;
	},
	
	queue: [],
	colliding: false,
	
	updateQueue: function(position, angle) {
		var tt = game.simulationTime;
		var newPosition = new paper.Point(position.x * physics.scale, position.y * physics.scale);
		this.position = newPosition;
		var cornerPos = newPosition.subtract([this.div.width()/2,this.div.height()/2]);
		if (this.queue.length == 0 || this.first || this.colliding || this.thrusting || this.last) {
			if ((this.justHit || this.thrusting || this.last) && this.queue.length > 0) {
				var preEvent = this.queue.pop();
				preEvent.slideToLeft = cornerPos.x;
				preEvent.slideToTop = cornerPos.y;
				preEvent.turnToAngle = angle;
				preEvent.toTime = game.simulationTime * 1000;
				this.queue.push(preEvent);
				this.justHit = false;
				this.thrusting = false;
			}
			if (this.isA(particle) && this.last) {
				this.body.GetWorld().DestroyBody(this.body);
				//dbg(this.printQueue());
			}
			this.last = this.first = false;
			this.queue.push({
				time: game.simulationTime * 1000,
				left: cornerPos.x,
				top: cornerPos.y,
				position: newPosition,
				angle: angle,
				target: this,
				do: function(currentTime) {
					this.target.div.css({ left: cornerPos.x, top: cornerPos.y });
					this.target.position = this.position;
					if (this.angle) {
						this.target.canvas.css({ rotate: angle });
						this.target.angle = this.angle;
					}
					if (this.slideToLeft) {
						this.target.div.transition(
							{ left: this.slideToLeft, top: this.slideToTop },
							(this.toTime - currentTime), "linear");
					}
					if (this.turnToAngle) {
						this.target.canvas.transition(
							{ rotate: this.turnToAngle },
							(this.toTime - currentTime), "linear");
					}
				}
			});
		}
	},
	
	printQueue: function() {
		var retstr = "  " + this.name + ": ";
		for(var i = 0; i < this.queue.length; i++) {
			var e = this.queue[i];
			retstr += "[" + Math.round(e.time);
			if (e.left) { retstr += " - " + Math.round(e.left) + "," + Math.round(e.top); }
			if (e.toTime) { retstr += " -> " + Math.round(e.toTime) }
			retstr += "]";
		}
		return retstr;
	},
	
	beginContact: function(contact, otherObject) {
		if (!(otherObject.isA(buoy))) {
			this.colliding = true;
			this.justHit = true;
		}
		this.beginContactSpecific(contact, otherObject);
		//dbg("endbegin");
	},
	
	beginContactSpecific: function(contact, otherObject) {
	},
	
	endContact: function(contact, otherObject) {
		if (!(otherObject.isA(buoy))) {
			this.colliding = false;
		}
		//dbg("endend");
	}
}

var rock = Object.create(spaceObject);

rock.initialize = function(position, size) {
	var w = size || Math.floor((Math.random()*30)+50);
	this.size = w;
	w = w + 2*shadowMargin;
	
	this.name = "R.O.C.R.";
	this.description = "Specially designed for the race track, these grey artificial lumps of inert matter are resilient and bouncy, leaving any impacting ship mostly in one piece. Daring players may see them more as an opportunity than an obstacle.";
	
	var r = w/2;
	this.elementBounds = new paper.Rectangle(position.x - r, position.y - r, w, w);
	this.createElements(this.elementBounds);
	
	this.path = new paper.Path();

	var c = new paper.Point(r, r);
	var segments = Math.floor((Math.random()*10)+10);
	for (var a = 0; a < 360; a += Math.floor(360/segments)) {
		var l = Math.floor((Math.random()*this.size/2/4)+this.size/2*3/4);
		var p = new paper.Point({ length: l, angle: a });
		this.path.add(c.add(p));
	}
	this.path.style = {
		fillColor: "black",
		strokeColor: "white",
		strokeWidth: 2,
		shadowColor: "darkGrey",
		shadowBlur: 20
	};
	
	this.path.closed = true;
	this.path.smooth();
	this.outerPath = this.path;
	
	this.rotationSpeed = randomInt(0, 90);
	this.momentum = new paper.Point(randomInt(0, 50), randomInt(0, 50));
}

var debris = Object.create(rock);

debris.initialize = function(position, data) { // path, momentum
	this.name = "Ship debris";
	this.description = "Once a proud racer, now just a hazard on the track.";

	this.path = data.path;
	this.path.style = {
		fillColor: "black",
		strokeColor: "white",
		strokeWidth: 2,
		shadowColor: "darkGrey",
		shadowBlur: 20
	};
	
	this.path.closed = true;
	this.outerPath = this.path;
	
	this.elementBounds = addMarginToBounds(this.path.strokeBounds(), shadowMargin);
	this.createElements(this.elementBounds);
	
	this.rotationSpeed = randomInt(0, 180);
	this.momentum = data.momentum;
}

var buoy = Object.create(spaceObject);

buoy.initialize = function(position, number) {

	this.name = "Race Track Buoy #" + number;
	this.description = "Buoys are mostly harmless miniature void holes, useful for their great positional stability. Fly through these markers in the right order to complete the track."
	// Obsolete: Buoys are mostly stationary and harmless, but they will avoid any R.O.C.K. obstacles that come too close, and painfully deflect any racers who do not know their numbers.";
	this.number = number;
	
	var r = 15 + shadowMargin;
	this.elementBounds = new paper.Rectangle(position.x - r, position.y - r, 2*r, 2*r);
	this.createElements(this.elementBounds);
	
	var circle = new paper.Path.Circle({
		center: new paper.Point(r, r),
		radius: r - shadowMargin,
		fillColor: "black",
		//strokeColor: "white",
		strokeColor: undefined,
		strokeWidth: 2,
		//shadowColor: "OrangeRed",
		shadowColor: "white",
		shadowBlur: 20
	});
	
	var buoyNumber = new paper.PointText(circle.position);
	buoyNumber.content = number;
	
	//buoyNumber.font = "Optima-ExtraBlack";
	//buoyNumber.font = "MarkerFelt-Wide";
	buoyNumber.style = {
		font: "Optima-ExtraBlack",
		fontSize: 20,
		strokeWidth: 1,
		fillColor: "white"
	};
	buoyNumber.position = circle.position;
	
	this.path = new paper.Group(circle, buoyNumber);
	this.outerPath = circle;
}

buoy.createBox2dBody = function() {
	var origin = paperToBox2D(this.position);
	this.box2dBody = new Body(physics, {
		shape: "circle",
		radius: this.outerPath.strokeBounds.width/physics.scale,
		fixedRotation: true,
		isSensor: true,
		x: origin.x, y: origin.y }, this);
}

buoy.updateQueue = function(position, angle) {
	// Buoys don't move much
}

buoy.animateHit = function() {
	this.queue.push({
		time: game.simulationTime * 1000,
		target: this,
		do: function(currentTime) {
			var that = this.target;
			that.div.transition({scale: 1.2}, 300, function() {
				that.div.transition({scale: 1}, 300);
			});
		}
	});
}

var ship = Object.create(spaceObject);

ship.initialize = function(position, player) {
	this.model = player.ship;
	this.playerName = player.name;
	this.name = this.model.name;
	this.description = this.model.description;
	this.power = this.model.power;
	this.health = this.model.maxHealth;
	this.maxHealth = this.health;
	this.mass = this.model.mass;
	this.buoysVisited = 0;
	
	this.elementBounds = createBoundsFrom(this.model.pathProperties.segments, shadowMargin);
	this.createElements(this.elementBounds);
	
	this.path = new paper.Path(this.model.pathProperties);
	
	this.path.smooth();
	this.outerPath = this.path;
}

ship.setColor = function(color) {
	this.path.shadowColor = color;
}

ship.beginContactSpecific = function(contact, otherObject) {
	if (otherObject.isA(buoy) && otherObject.number == this.buoysVisited + 1) {
		this.buoysVisited++;
		otherObject.animateHit();
		if (this.buoysVisited > game.leader) game.leader = this.buoysVisited;
		if (this.buoysVisited == playField.numBuoys) game.winners.push(this.playerName);
	} else {
		var thisSpeed = this.body.GetLinearVelocity(),
			otherSpeed = otherObject.body.GetLinearVelocity(),
			thisPaper = new paper.Point(thisSpeed.x, thisSpeed.y),
			otherPaper = new paper.Point(otherSpeed.x, otherSpeed.y),
			totalVector = thisPaper.subtract(otherPaper),
			totalImpact = totalVector.multiply(otherObject.body.GetMass());
		this.damage(totalImpact.multiply(2));
	}
}

ship.damage = function(damageVector) {
	this.health = this.health - Math.min(damageVector.length, this.health);
	if (this.health == 0) {
		this.destroyed = true;
	}
}

var particle = Object.create(spaceObject).extend({
	particleSize: 6,
	particleSizeRandom: 2,
	speed: 300,
	numParticles: 2,
	
	setUp: function(generator, impulse, color) {
		this.name = "Particle from " + generator.playerName + "'s " + generator.name;
		this.size = randomInt(this.particleSize, this.particleSizeRandom);
		var particleImpulse = new paper.Point(10,10);
		particleImpulse.length = particle.speed;
		particleImpulse.angle = impulse.angle - 180 + randomInt(0,5);
		this.position = (new paper.Point(0,0)).add(particleImpulse);
		var b = generator.outerPath.strokeBounds;
		this.position.length =
			Math.sqrt(b.width*b.width + b.height*b.height)/2 +
			this.size + randomIntBase(0, 40);
		this.position = this.position.add(generator.position);
		
		var $particle = 
			$('<div/>', { class: generator.id() })
			.width(this.size) // Set visible size (CSS)
			.height(this.size);
		$particle.css({ position: "absolute",
			marginLeft: 0, marginTop: 0,
			top: this.position.y - this.size/2, left: this.position.x - this.size/2,
			backgroundColor: color
			//border:"1px solid #ffffff"
		});
		this.div = $particle;
		this.canvas = $particle;
		this.div.css({ visibility: "hidden" });
		$("#spaceobjects").append($particle);
		this.collisionId = generator.id();
		this.queue = [];
		
		this.createBox2dBody();
		this.body = this.box2dBody.body;
		this.body.SetLinearVelocity(generator.body.GetLinearVelocity());
		this.body.ApplyImpulse(
			particleImpulse.divide(physics.scale*stepSeconds).multiply(this.body.GetMass()),
			this.body.GetWorldCenter());
	},
	
	createBox2dBody: function() {
		var origin = paperToBox2D(this.position);
		this.box2dBody = new Body(physics, {
			shape: "block",
			density: 0.05,
			fixedRotation: true,
			x: origin.x, y: origin.y,
			width: this.size/physics.scale, height: this.height/physics.scale
		}, this);
	},
	
	update: function(position, angle) {
		this.position = new paper.Point(position.x * physics.scale, position.y * physics.scale);
		var cornerPos = this.position.subtract([this.div.width()/2,this.div.height()/2]);
		this.div.css({ left: cornerPos.x, top: cornerPos.y });
	},
	
	beginContactSpecific: function(contact, otherObject) {
		this.removeParticle();
	},
	
	removeParticle: function() {
		this.last = true;
		this.queue.push({ 
			time: game.simulationTime * 1000,
			target: this,
			do: function(currentTime) {
				this.target.div.css({ visibility: "hidden" });
			}
		});
	}
});

function createParticle(sourceBounds, sourceAngle) {
	var position = sourceBounds.center;
	var size = sourceBounds.size;
	var exhaustAngle = sourceAngle - 180;
	var particleSize = randomInt(particles.size, particles.sizeRandom);

	var startingOpacity = randomInt(95, 10)/100;
	
	var toCorner = new paper.Point({angle: exhaustAngle, length: new paper.Point(size.width, size.height).length/2 });
	var spread = new paper.Point({ length: randomInt(25, 50), angle: randomInt(exhaustAngle, particles.angleRandom) });
	var startingPosition = position.add(toCorner).add(spread).add(new paper.Point(-particleSize/2,-particleSize/2));
	
	var $particle = 
		$('<div/>', {})
		.width(particleSize) // Set visible size (CSS)
		.height(particleSize);
	$particle.css({ position: "absolute",
		marginLeft: 0, marginTop: 0,
		top: Math.round(startingPosition.y), left: Math.round(startingPosition.x),
		opacity: startingOpacity,
		backgroundColor: "white"
		//border:"1px solid #ffffff"
	});
	$("body").append($particle);
	
	var lifeSpan = randomInt(particles.lifeSpan, particles.lifeSpanRandom);
	var endPosition = startingPosition.add(new paper.Point({
		length: randomInt(particles.length, particles.lengthRandom),
		angle: randomInt(exhaustAngle, particles.angleRandom)
	}));
	$particle.transition({ x: endPosition.x, y: endPosition.y, opacity: 0 }, lifeSpan, 'linear', $particle.remove);
}

var particles = {
	// Random spread from origin
	spread: 10,
	//
	totalParticles: 25,
	size: 6,
	sizeRandom: 2,
	length: 10,
	lengthRandom: 5,
	// Lifespan in ms
	lifeSpan: 500,
	lifeSpanRandom: 100,
	//angle: 0,
	angleRandom: 45,
	startColor: [0, 200, 255, 1], // startColour: [255, 131, 0, 1],
	startColorRandom: [48, 50, 45, 0],
	endColor: [0, 100, 245, 0],
	endColorRandom: [60, 60, 60, 0],
}
