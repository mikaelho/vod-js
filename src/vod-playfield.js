var playFields = [ randomScramble ];

var randomScramble = {
	name: "Random Scramble",
	bounds: new paper.Rectangle(0, 0, 2100, 1300),
	cellSize: 100,
	numBuoys: 5,
	numRocks: 10,
	
	initialize: function() {
		var cellsHorizontal = Math.floor(this.bounds.width/this.cellSize);
		var cellsVertical = Math.floor(this.bounds.height/this.cellSize);
		var maxX = cellsHorizontal - 1;
		var maxY = cellsVertical - 1;
		var centerX = Math.round(cellsHorizontal/2) - 1;
		var centerY = Math.round(cellsVertical/2) - 1;
		var cells = [];
		
		for(var i = 1; i < (cellsHorizontal - 1); i++) {
			for(var j = 1; j < (cellsVertical - 1); j++) {
				if (i == centerX && j == centerY) continue;
				cells.push({ x: i, y: j });
			}
		};
		
		var coordinates = function(cellCoords) {
			return new paper.Point(
				cellCoords.x * randomScramble.cellSize + randomScramble.cellSize / 2,
				cellCoords.y * randomScramble.cellSize + randomScramble.cellSize / 2);
		};
		
		var jitter = function(path) {
			var maxDimension = Math.max(path.bounds.width, path.bounds.height);
			var room = Math.floor((randomScramble.cellSize - maxDimension)/2);
			var a = randomIntBase(0, 360);
			var l = randomIntBase(1, room);
			path.position = path.position.add(new paper.Point({ angle: a, length: l }));
		};
		
		// Rocks
		for(var i = 0; i < this.numRocks; i++) {
			var r = Object.create(rock);
			r.setUp(coordinates(pickOne(cells)));
			//jitter(r.path);
			game.spaceObjects.push(r);
		}
		
		// Buoys
		var b = Object.create(buoy);
		b.setUp(coordinates({ x: centerX, y: centerY }), 1);
		game.spaceObjects.push(b);
		for(var i = 2; i < this.numBuoys + 1; i++) {
			b = Object.create(buoy);
			b.setUp(coordinates(pickOne(cells)), i);
			//jitter(b.path);
			game.spaceObjects.push(b);
		}
		
		// Walls
		/*
		var width = randomScramble.bounds.width/physics.scale,
			height = randomScramble.bounds.height/physics.scale,
			t = 0.5;
		
		new Body(physics, { type: "static", isSensor: true, restitution: 1, x: -t/2, y: height/2, height: height,  width: t });
		new Body(physics, { type: "static", isSensor: true, restitution: 1, x: width + t/2, y: height/2, height: height,  width: t});
		new Body(physics, { type: "static", isSensor: true, restitution: 1, x: width/2, y: -t/2, height: t, width: width });
		new Body(physics, { type: "static", isSensor: true, restitution: 1, x: width/2, y: height + t/2, height: t, width: width });
		*/
		
		randomScramble.shipIntro();
	},
	
	shipIntro: function() {
		var field = randomScramble.bounds;
		var startingSlots = [ field.topLeft, field.topRight, field.bottomLeft, field.bottomRight ];
		for(var i in game.players) {
			var startingSlot = pickOne(startingSlots);
			var toCenter = field.center.subtract(startingSlot);
			toCenter.length = 100; //s.power/2;
			//var startingPosition = startingSlot.subtract(toCenter);
			var startingPosition = startingSlot.add(toCenter);

			var s = Object.create(ship).setUp(startingPosition, game.players[i]);
			s.setColor(game.players[i].color);
			
			s.body.SetAngle(degToRad(toCenter.angle));
			s.momentum = toCenter;
			//s.momentum.length = 100/30;
			//s.body.ApplyImpulse(s.momentum.divide(physics.scale), s.body.GetWorldCenter());
			//s.body.SetLinearVelocity(s.momentum);
			s.body.SetAngularDamping(0.5);
			game.spaceObjects.push(s);
			game.ships.push(s);
		}
		//paper.project.view.draw();
	}
};
