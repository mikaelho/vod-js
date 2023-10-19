var steps = 3,
	stepDuration = 2000,
	totalDuration = steps * stepDuration,

	timeline = {
	
		initialize: function() {
			this.queue = {};
		},
		
		add: function(thing, spec) {
			var startDelta = spec.start || 0;
			spec.start = startDelta;
			var endDelta = spec.end || totalDuration;
			spec.end = endDelta;
			var entry = this.queue["" + startDelta];
			if (!entry) entry = [];
			entry.push({ thing: thing, transition: spec });
			this.queue["" + startDelta] = entry;
		},
		
		start: function() {
			this.startTime = new Date().getTime();
			this.targetTime = this.startTime + totalDuration;
			this.sortedKeys = Object.keys(this.queue);
			this.sortedKeys.sort();
			rAF(this.step.bind(this));
		},
		
		step: function(currentTime) {
			if (currentTime > this.targetTime) return;
			
			this.processQueue(currentTime);
			this.collisionDetection(currentTime);
			
			rAF(this.step.bind(this));
		},
		
		processQueue: function(currentTime) {
			if (this.sortedKeys.length == 0) return; // Run to the end;
			var timeKey = parseInt(this.sortedKeys[0]);
			var s = this.startTime + timeKey;
			if (s <= currentTime) { 
				s = Math.min(s, currentTime);
				var timeStep = this.queue[timeKey];
				for(var i = 0; i < timeStep.length; i++) {
					var e = timeStep[i];
					var t = e.transition;
					if (t.move) {
						var paperPoint = t.move.absolute ? t.move.point : e.thing.path.bounds.topLeft.add(t.move.point);
						var screenPoint = paperToScreenPoint(paperPoint);
						if (e.thing.isA(rock)) {
							dbg(t.move.point + "<>" + paperToScreenPoint(t.move.point) +
							" - " + paperPoint + "<>" + screenPoint);
							new paper.Path([paperToScreenPoint(e.thing.path.bounds.center), paperToScreenPoint(e.thing.path.bounds.center.add(t.move.point))]);
							paper.project.view.draw();
						}
						e.thing.div.transition(
							{
								left: Math.round(screenPoint.x),
								top: Math.round(screenPoint.y),
								duration: t.end + this.startTime - currentTime,
								easing: "linear"
							});
					}
					if (t.rotate) {
						e.thing.canvas.transition(
							{
								rotate: (t.rotate.absolute ? "" : "+=") + t.rotate.angle,
								duration: t.end + this.startTime - currentTime,
								easing: "linear"
							});
					}
					//a.thing.transition(
					//	this.buildTransition(a.transition), 
					//	a.transition.end - s,
					//	'linear');
				}
				this.sortedKeys.splice(0, 1);
			}
		},
		
		abort: function() {
		},
		
		pause: function(object) {
		},
		
		resume: function() {
			
		}
	};