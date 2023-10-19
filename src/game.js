Game = {
  // Initialize and start our game
  start: function() {
    Crafty.init();
    Crafty.viewport.reload(); // To force iPad version to fill the whole screen
    //Crafty.background('black');
	
    var ship = Crafty.e("2D, Canvas, RotatingShape, PlayerShip, SuicidePod, Tween, Mouse")
    	.attr({x:500,y:50})
    	.showDecoration();
    	//.particles(particleOptions)
    	
    Crafty.e("2D, Canvas, RotatingShape, Rock")
    	.Rock()
    	.attr({x:200,y:500, rotation: 45});
    	//.tween({rotation:360},200);

	Crafty.e('2D, DOM, Mouse, Keyboard')
		.attr({
			x: 0,
			y: 0,
			w: Crafty.stage.elem.clientWidth,
			h: Crafty.stage.elem.clientHeight
		})
		.bind('Click', function(e) {
			Crafty("PlayerShip").checkInput(e.realX, e.realY);
		})
		.bind('MouseMove', function(e) {
			Crafty("PlayerShip").checkInput(e.realX, e.realY);
		});
		//.textColor('#000000')

    //Crafty.viewport.centerOn(shape, 0, 0);
  }
}

/*
        var particleOptions = {
      maxParticles: 200,
      size: 8,
      sizeRandom: 3,
      speed: 20,
      speedRandom: 1.2,
      // Lifespan in frames
      lifeSpan: 10,
      lifeSpanRandom: 7,
      // Angle is calculated clockwise: 12pm is 0deg, 3pm is 90deg etc.
      angle: 0,
angleRandom: 5,
startColour: [0, 200, 255, 1], // startColour: [255, 131, 0, 1],
startColourRandom: [48, 50, 45, 0],
endColour: [0, 100, 245, 0],
endColourRandom: [60, 60, 60, 0],
// Only applies when fastMode is off, specifies how sharp the gradients are drawn
sharpness: 20,
sharpnessRandom: 10,
// Random spread from origin
spread: 10,
// How many frames should this last
duration: 200,
// Will draw squares instead of circle gradients
fastMode: true,
gravity: { x: 0.0, y: 0.0 },
// sensible values are 0-3
jitter: 0
};
*/