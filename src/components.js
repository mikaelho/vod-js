Crafty.c('Thing', {
	init: function() {
		this.requires('2D, Canvas');
	}
});

Crafty.c('RotatingShape', {
	init: function() {
		this.previousRotation = 0;
		
		this.outline = true;
		this.strokeStyle = "white";
		this.lineWidth = 1;
		this.lineJoin = "round";
		
		this.filled = true;
		this.fillStyle = "black";
		
		this.shadow = true;
		this.shadowColor = "cyan";
		this.shadowBlur = 20;
	},

	setShape: function(poly, rotation) {
		this.rotation = rotation || 0;
	
		// Find bounds
		var minx = poly.points[0][0];
		var maxx = minx;
		var miny = poly.points[0][1];
		var maxy = miny;
		for(var i in poly.points) {
			var p = poly.points[i];
			if (p[0] < minx) minx = p[0];
			if (p[0] > maxx) maxx = p[0];
			if (p[1] < miny) miny = p[1];
			if (p[1] > maxy) maxy = p[1];
		}
		// Find polygon center
		var cx = (maxx - minx)/2 + minx;
		var cy = (maxy - miny)/2 + miny;
		
		// Determine shape rotation radius, i.e. point furthest from the center
		var rr = 0;
		for(var i in poly.points) {
			var p = poly.points[i];
			var d = Crafty.math.distance(cx, cy, p[0], p[1]);
			if (d > rr) rr = d;
		}
		
		// Set height and width to have room for rotating the shape
		this.w = this.h = rr * 2;
		
		// Set offset and shift polygon to center of rotation area
		this.rotationRadius = rr;
		poly.shift(rr - cx, rr - cy);
		this.shape = poly;
		if (this.rotation != 0) this.setRotation(this.rotation);
		else this.previousRotation = 0;
		return this;
	},
	
	setRotation: function(rotation) {
		var diff = rotation - this.previousRotation;
		this.rotation = rotation;
		this.previousRotation = this.rotation;
		this.shape.rotate({
			cos: Math.cos(-diff * Math.PI/180),
			sin: Math.sin(-diff * Math.PI/180),
			o: {
				x: this.rotationRadius,
				y: this.rotationRadius
			}
		});
	},
	
	alignToVector: function(v) {
		var northArrow = new Crafty.math.Vector2D(0,-1);
		var angle = Crafty.math.radToDeg(northArrow.angleBetween(v));
		this.setRotation(angle);
	},
	
	centerPosition: function() {
		return new Crafty.math.Vector2D(Math.floor(this.x + this.w/2), Math.floor(this.y + this.h/2));
	},
	
	draw: function() {
		// Make sure any rotation set directly by attribute has been completed
		if (this.rotation != this.previousRotation) this.setRotation(this.rotation);
		
		// Actual drawing
		var ctx = Crafty.canvas.context;
		ctx.save();
		ctx.beginPath();
		for(var j in this.shape.points){
			var p = this.shape.points[j];
			ctx.lineTo(this.x + p[0], this.y + p[1]);
		}
		ctx.closePath();
		
		if (this.outline) {
			ctx.lineWidth = this.lineWidth;
			ctx.strokeStyle = this.strokeStyle;
			ctx.lineJoin = this.lineJoin;
			ctx.stroke();
		}
		
		// Shadow
		if (this.shadow) {
			ctx.shadowColor = this.shadowColor;
			ctx.shadowBlur = 20;
		}
		
		// Fill shape
		if (this.filled) {
			ctx.fillStyle = this.fillStyle;
			ctx.fill();
		}
		
		// Uncomment for debug bounding boxes
		//ctx.strokeRect(this.x,this.y,this.w,this.h);
		
		ctx.restore();
	}
});

Crafty.c("PowerBubble", {
	PowerBubble: function(power) {
		this.power = power || 0;
		this.w = this.h = this.power * 2;
		this.visible = false;
		
		return this;
	},
	
	checkHit: function(x, y) {
		return (Crafty.math.distance(x, y, this.x + this.power, this.y + this.power) <= this.power);
	},
	
	draw: function() {
		var cx = this.x + this.power;
		var cy = this.y + this.power;
		var ctx = Crafty.canvas.context;
		ctx.save();
		var rad = ctx.createRadialGradient(cx, cy, this.power * 0.9, cx, cy, this.power);
		rad.addColorStop(0, 'rgba(255,255,255,0)');
		rad.addColorStop(1, 'rgba(255,255,255,0.5)');
		ctx.fillStyle = rad;
		ctx.beginPath();
		ctx.arc(cx,cy,this.power - 1,0,2*Math.PI);
		ctx.closePath();
		ctx.fill();
		ctx.restore();
	}
});

Crafty.c("PlayerShip", {
	init: function() {
		this.momentum = new Crafty.math.Vector2D(0, 0);
	},
		
	showDecoration: function() {
		var currentPosition = this.centerPosition();
		var newPosition = new Crafty.math.Vector2D(currentPosition.x, currentPosition.y)
			.add(this.momentum);
		this.bubble = Crafty.e("2D, Canvas, PowerBubble")
			.PowerBubble(this.currentPower)
			.attr({
				x: newPosition.x - this.currentPower,
				y: newPosition.y - this.currentPower,
				visible: true
			});
		this.arrow = Crafty.e("2D, Canvas, VectorArrow")
			.VectorArrow(currentPosition, this.momentum);
		//this.z = this.arrow.z + 1;
	},
	
	checkInput: function(x, y) {
		if (this.bubble) {
			if (this.bubble.checkHit(x, y)) {
				var currentPosition = this.centerPosition();
				this.momentum = new Crafty.math.Vector2D(x - currentPosition.x, y - currentPosition.y);
				this.arrow.updateVectorArrow(currentPosition, this.momentum);
				this.alignToVector(this.momentum);
			}
		}
	}
});

Crafty.c("SuicidePod", {
	init: function() {
		this.requires("RotatingShape", "PlayerShip");
		this.maxPower = this.currentPower = 100;
		var points = [[6,0],[9,0],[12,3],[12,12],[15,15],[12,15],[9,18],[6,18],[3,15],[0,15],[3,12],[3,3]];
		this.setShape(new Crafty.polygon(points));
		this.momentum = new Crafty.math.Vector2D(200, 50);
		this.alignToVector(this.momentum);
	}
});

Crafty.c("VectorArrow", {
	VectorArrow: function(start, vector) {
		this.color = "0,255,255";
		this.lineWidth = 3;
		this.updateVectorArrow(start, vector);
		
		return this;
	},
	
	updateVectorArrow: function(start, vector) {
		this.x = Math.min(start.x, vector.x);
		this.y = Math.min(start.y, vector.y);
		this.w = Math.abs(start.x - vector.x);
		this.h = Math.abs(start.y - vector.y);
		this.start = start;
		this.vector = vector;
		var grad = Crafty.canvas.context.createLinearGradient(start.x, start.y, this.start.x+this.vector.x, this.start.y+this.vector.y);
		grad.addColorStop(0, 'rgba('+this.color+',0)');
		grad.addColorStop(0.05, 'rgba('+this.color+',0)');
		grad.addColorStop(1, 'rgba('+this.color+',1)');
		this.strokeStyle = grad;
	},
	
	draw: function() {
		var ctx = Crafty.canvas.context;
		ctx.save();
		ctx.beginPath();
		ctx.moveTo(this.start.x, this.start.y);
		ctx.lineTo(this.start.x+this.vector.x, this.start.y+this.vector.y);
		ctx.strokeStyle = this.strokeStyle;
		ctx.lineWidth = this.lineWidth;
		ctx.stroke();
	}
	
/*
	init: function() {
		this.rotation = 0;
		this.fill = true;
		this.outline = false;
		this.shadow = false;
		this.fillStyle = "white";
		this.color = "0,255,255";
	},
	
	setArrow: function(starting, arrow) {
		var length = Math.floor(arrow.magnitude());
		var bottom = length > 3 ? length : 3;
		var points = [[0,6],[6,0],[12,6],[9,6],[9,bottom],[3,bottom],[3,6]];
		this.setShape(new Crafty.polygon(points));
		this.alignToVector(arrow);
		this.x = starting.x + arrow.x/2 - this.w/2;
		this.y = starting.y + arrow.y/2 - this.h/2;
		var grad = Crafty.canvas.context.createLinearGradient(starting.x, starting.y, starting.x + arrow.x, starting.y + arrow.y);
		grad.addColorStop(0, 'rgba('+this.color+',0)');
		grad.addColorStop(0.05, 'rgba('+this.color+',0)');
		grad.addColorStop(1, 'rgba('+this.color+',1)');
		this.fillStyle = grad;
	}
*/
});

Crafty.c("Rock", {
	Rock: function(size) {
		var sizeString = size || "random";
		this.w = Math.floor((Math.random()*80)+20);
		switch (sizeString) {
			case "small": this.w = 20; break;
			case "medium": this.w = 40; break;
			case "large": this.w = 60; break;
			case "huge": this.w = 100; break;
		}
		this.h = this.w;
		
		// Create polygon
		var cx = this.w/2;
		var cy = cx;
		var baseVector = new Crafty.math.Vector2D(cx, cy);
		var sectors = Math.floor((Math.random()*6)+4);
		var points = [];
		for (var angle = 0; angle < 360; angle += Math.floor(360/sectors)) {
			var l = Math.floor((Math.random()*this.w/6)+this.w*2/6);
			var v = new Crafty.math.Vector2D(Math.sin(angle*Math.PI/180), -Math.cos(angle*Math.PI/180));
			v.scaleToMagnitude(l);
			v.add(baseVector);
			points.push([Math.floor(v.x),Math.floor(v.y)]);
		}
		this.setShape(new Crafty.polygon(points));
		
		return this;
	}
});
