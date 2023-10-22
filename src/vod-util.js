var shadowMargin = 40;

var rAF = window.mozRequestAnimationFrame || 
	window.requestAnimationFrame ||
	window.webkitRequestAnimationFrame;

var events = {};
events.startEvent = Modernizr.touch ? 'touchstart' : 'mousedown';
events.endEvent = Modernizr.touch ? 'touchend' : 'mouseup';
events.moveEvent = Modernizr.touch ? 'touchmove' : 'mousemove';

if (typeof Object.create !== 'function') {
    Object.create = function (o) {
        function F() {};
        F.prototype = o;
        return new F();
    };
}

paper.Item.prototype.lastAngle = 0;
paper.Item.prototype.rotateAbsolute = function(rotation) {
	this.rotate(rotation - this.lastAngle);
	this.lastAngle = rotation;
}
paper.Item.prototype.moveAndRotate = function(point, radians) {
	this.position = point;
	this.rotateAbsolute(radToDeg(radians));
}

function degToRad(degrees) {
	return degrees * Math.PI / 180;
}

function radToDeg(radians) {
	return 180 * radians / Math.PI;
}

function dbg(value) {
	$("#debug").text(value);
}

function inSpace(func) {
	game.spaceObjects.forEach(function(element, index, array) {
		var first = (index == 0);
		func(element);
	});
}

function pickOne(array) {
	var index = randomIntBase(0, array.length);
	var value = array[index];
	array.splice(index, 1);
	
	return value;
}

var currentTouches = null;
var origFocus = null;
var currentFocus = null;
var lastFocus = null;
var currentZoom = 1;
var lastTouch = null;
var origTouch = null;
var moved = false;
var hits = null;

function setEvents() {
	var $okbutton = $("#okbutton");
	$okbutton.on("click",
		function(event) {
			event.preventDefault();
			event.stopPropagation();
			game.progress();
		});
	var $dialog = $("#dialogbackground");
	$dialog.on(events.startEvent,
		function(event) {
			event.preventDefault();
			event.stopPropagation();
		});
	$dialog.on(events.endEvent,
		function(event) {
			event.preventDefault();
			event.stopPropagation();
			if (!game.calculating) game.hideDialog();
		});
	var $space = $("#spaceevents");
	$space.on(events.startEvent,
		function(event) {
			//event.preventDefault();
			event.stopPropagation();
			//currentFocus = findFocus(event.originalEvent.touches);
			currentTouches = event.originalEvent.touches;
			let pointerEvent = currentTouches && currentTouches.length == 1 ? currentTouches[0] : event;
			if (pointerEvent) {
				lastTouch = new paper.Point(pointerEvent.pageX, pointerEvent.pageY);
				console.log(lastTouch);
				moved = false;
				hits = ($("#hud").css("visibility") == "visible") ?
					game.hudLayer.hitTest(screenToElement(lastTouch)) : null;
			}
		});
	$space.on(events.moveEvent,
		function(event) { 
			event.preventDefault();
			//currentFocus = screenToElement(findFocus(event.originalEvent.touches));
			if (!lastTouch) {
				return;
			}
			currentTouches = event.originalEvent.touches;
			let pointerEvent = currentTouches && currentTouches.length == 1 ? currentTouches[0] : event;
			if (pointerEvent) {
				currentTouch = new paper.Point(pointerEvent.pageX, pointerEvent	.pageY);

				moved = true;
				if (hits) {
					game.moveThrusts(hits.item, screenToElement(currentTouch));
				} else {
					if (lastTouch) {
						var diff = currentTouch.subtract(lastTouch);
						$("#moveable").transition({ left: "+=" + diff.x + "px", top: "+=" + diff.y + "px" }, 0, "linear");
						game.hudLayer.view.center =
							game.hudLayer.view.center.subtract(diff.divide(game.currentScale));
						/*for(var i in paperManager.allProjects) {
							paperManager.allProjects[i].view.center = game.hudLayer.view.center;
						}*/
					}
					lastTouch = currentTouch;
				}
			}
		});
	$space.on(events.endEvent,
		function(event) {
			//event.preventDefault();
			if (!moved) {
				var clickPoint = screenToElement(lastTouch);
				if (hits) {
					game.moveThrusts(hits.item, clickPoint);
				} else {
					if (game.zoomedOut) {
						setZoomTo(new paper.Rectangle(
							clickPoint.x - 400,
							clickPoint.y - 400,
							800,
							800),
							clickPoint);
						game.zoomedOut = false;
					} else {
						setZoomTo(playField.bounds, clickPoint);
						game.zoomedOut = true;
					}
				}
			}
			lastTouch = null;
			moved = false;
			hits = null;
		});
	/*
		gesturestart: function(event) {
			event.preventDefault();
		},
		gesturechange: function(event) { 
			event.preventDefault();
		},
		gestureend: function(event) { 
			event.preventDefault();
		}
	*/
}

function calculateZoom(objectBounds) {
	var zoomObject = { };
	var objectRatio = objectBounds.width/objectBounds.height;
	var screenRatio = $(window).width()/$(window).height();
	
	if (objectRatio > screenRatio) {
		targetView = new paper.Rectangle(
			objectBounds.x, objectBounds.y - (objectBounds.width / screenRatio - objectBounds.height)/2,
			objectBounds.width, objectBounds.width / screenRatio);
	} else {
		targetView = new paper.Rectangle(
			objectBounds.x - (objectBounds.height * screenRatio - objectBounds.width)/2, objectBounds.y,
			objectBounds.height * screenRatio, objectBounds.height);
	}
	
	zoomObject.scale = $(window).width()/targetView.width;
	game.currentScale = zoomObject.scale;
	//physics.debug();
	zoomObject.left = Math.round((-targetView.x) * zoomObject.scale) + "px";
	zoomObject.top = Math.round((-targetView.y) * zoomObject.scale) + "px";
	zoomObject.center = targetView.center;
	
	return zoomObject;
}

var targetView;
var zoomDuration = 1000;

function setZoomTo(bounds, origin) {
	var zoomObject = calculateZoom(bounds);
	var tOrigin = origin || new paper.Point(0,0);
	//zoomObject.transformOrigin = tOrigin.x + "px " + tOrigin.y + "px";
	zoomObject.transformOrigin = "0px 0px";
	$("#moveable").css(zoomObject);
	game.hudLayer.view.zoom = zoomObject.scale;
	game.hudLayer.view.center = zoomObject.center;
	/*
	for(var i in paperManager.allProjects) {
		var v = paperManager.allProjects[i].view;
		v.zoom = zoomObject.scale;
		v.center = zoomObject.center;
	}
	*/
	$("#box2DDebug").css(zoomObject);
	game.updateScale();
}

function animateZoomTo(bounds, origin) {
	var zoomObject = calculateZoom(bounds);
	
	//if (origin) {
		//$("#spaceobjects").css({ transformOrigin: origin.x + "px " + origin.y + "px" });
	//}
	//$("#spaceobjects").css({scale: zoomObject.scale}, 1000, game.updateScale);
	//$("#spaceobjects").css({transformOrigin: Math.round(origin.x) + "px " + Math.round(origin.y) + "px", scale: zoomObject.scale});
	//$("#spaceobjects").css({ left: zoomObject.left, top: zoomObject.top });
	$("#moveable").css(zoomObject);
	game.updateScale();
	
}

function findFocus(touches) {
	var pointA = new paper.Point(touches[0].pageX, touches[0].pageY);
	var pointB = new paper.Point(touches[1].pageX, touches[1].pageY);
	return pointA.subtract(pointB).divide(2).add(pointB);
}

function paperToBox2D(point) {
	return new paper.Point(
		(point.x)/physics.scale,
		(point.y)/physics.scale);
}

function screenToElement(screenPoint) {
	var $element = $("#spaceobjects");
	var elemPos = $element.offset();
	var elementBounds = new paper.Rectangle(
		elemPos.left, elemPos.top,
		$element.width() * game.currentScale, $element.height() * game.currentScale);
	var elementPoint = new paper.Point(
		(screenPoint.x - elementBounds.x) * ($(window).width() / elementBounds.width),
		(screenPoint.y - elementBounds.y) * ($(window).height() / elementBounds.height));
	return elementPoint;
}

function screenToPaperPoint(screenPoint) {
	var viewBounds = paper.project.view.bounds;
	return new paper.Point(
		viewBounds.x + screenPoint.x / $(window).width() * viewBounds.width,
		viewBounds.y + screenPoint.y / $(window).height() * viewBounds.height);
}

function paperToScreenRect(paperRectangle) {
	return new paper.Rectangle(
		paperToScreenPoint(paperRectangle.topLeft),
		paperToScreenPoint(paperRectangle.bottomRight));
}

function paperToScreenPoint(paperPoint) {
	viewBounds = paper.project.view.bounds;
	return new paper.Point(
		(paperPoint.x - viewBounds.x) * $(window).width() / viewBounds.width,
		(paperPoint.y - viewBounds.y) * $(window).height() / viewBounds.height);
}

function roundRectangle(paperRect) {
	return new paper.Rectangle(
		Math.floor(paperRect.x),
		Math.floor(paperRect.y),
		Math.ceil(paperRect.width),
		Math.ceil(paperRect.height));
}

function ceilRectangle(paperRect) {
	return new paper.Rectangle(
		Math.ceil(paperRect.x),
		Math.ceil(paperRect.y),
		Math.round(paperRect.width),
		Math.round(paperRect.height));
}

function randomInt(base, range) {
	return Math.round(base + Math.random()*range - range/2);
}

function randomIntBase(base, rangeOnTop) {
	return Math.floor(base + Math.random()*rangeOnTop);
}
/*
function ellipseRadius(angleDeg) {
	var rad = (angleDeg) * Math.PI / 180;
	var a = playField.center.x;
	var b = playField.center.y;
	
	var dxphi = Math.sqrt(1/(1/(a*a)+((Math.tan(rad))*(Math.tan(rad)))/(b*b)));
	var dyphi = Math.tan(rad)*dxphi;
	return Math.sqrt(dxphi*dxphi + dyphi*dyphi);
}
*/
function outsideBounds(items) {
	var bounds = items[0].path.bounds;
	var x = bounds.x;
	var y = bounds.y;
	var right = bounds.right;
	var bottom = bounds.bottom;
	for(var i = 1; i < items.length; i++) {
		var b = items[i].path.bounds;
		x = Math.min(x, b.x);
		y = Math.min(y, b.y);
		right = Math.max(right, b.right);
		bottom = Math.max(bottom, b.bottom);
	}
	return new paper.Rectangle(
		x - shadowMargin,
		y - shadowMargin,
		right - x + 2 * shadowMargin,
		bottom - y + 2 * shadowMargin);
}

function createBoundsFrom(segments, margin) {
	var _margin = margin || 0;
	var minX = segments[0][0];
	var minY = segments[0][1];
	var maxX = minX;
	var maxY = minY;
	
	for(var i = 1; i < segments.length; i++) {
		var x = segments[i][0];
		var y = segments[i][1];
		minX = Math.min(x, minX);
		minY = Math.min(y, minY);
		maxX = Math.max(x, maxX);
		maxY = Math.max(y, maxY);
	}
	
	return new paper.Rectangle({
		from: [minX - margin, minY - margin],
		to: [maxX + margin, maxY + margin]
	});
}

function addMarginToBounds(rect, margin) {
	return new paper.Rectangle({
		x: rect.x - margin,
		y: rect.y - margin,
		width: rect.width + 2 * margin,
		height: rect.height + 2 * margin
	});
}

function zoomTo(objectBounds, endCallback) {
	var objectRatio = objectBounds.width/objectBounds.height;
	var screenRatio = $(window).width()/$(window).height();
	
	if (objectRatio > screenRatio) {
		targetView = new paper.Rectangle(0, 0, objectBounds.width, objectBounds.width / screenRatio);
	} else {
		targetView = new paper.Rectangle(0, 0, objectBounds.height * screenRatio, objectBounds.height);
	}
	
	targetView.center = objectBounds.center;
	targetView.zoom = paper.project.view.zoom * paper.project.view.bounds.width / targetView.width;
	targetView.startCenter = paper.project.view.center.clone();
	targetView.vector = targetView.center.subtract(paper.project.view.center);
	targetView.startZoom = paper.project.view.zoom;
	targetView.time = new Date().getTime() + zoomDuration;
	
	targetView.callback = endCallback;
	
	rAF(animateZoom);
}

function animateZoom(currentTime) {
	if (currentTime >= targetView.time) {
		paper.project.view.center = targetView.center;
		paper.project.view.zoom = targetView.zoom;
		if (targetView.callback) {
			setTimeout(targetView.callback, 10);
		}
		targetView = null;
	} else {
		var factor = 1 - (targetView.time - currentTime)/zoomDuration;
		paper.project.view.center = targetView.startCenter.add(targetView.vector.multiply(factor));
		paper.project.view.zoom = targetView.startZoom + (targetView.zoom - targetView.startZoom) * factor;
		rAF(animateZoom);
	}
}

// Parameter element should be a DOM Element object.
// Returns the rotation of the element in degrees.
function getRotationDegrees(element) {
    // get the computed style object for the element
    var style = window.getComputedStyle(element);
    // this string will be in the form 'matrix(a, b, c, d, tx, ty)'
    var transformString = style['-webkit-transform']
                       || style['-moz-transform']
                       || style['transform'] ;
    if (!transformString || transformString == 'none')
        return 0;
    var splits = transformString.split(',');
    // parse the string to get a and b
    var parenLoc = splits[0].indexOf('(');
    var a = parseFloat(splits[0].substr(parenLoc+1));
    var b = parseFloat(splits[1]);
    // doing atan2 on b, a will give you the angle in radians
    var rad = Math.atan2(b, a);
    var deg = 180 * rad / Math.PI;
    // instead of having values from -180 to 180, get 0 to 360
    if (deg < 0) deg += 360;
    return deg;
}

// Graham scan finds the convex hull of a set of points
// Needed to create Box2d bodies out of the convex shapes used for graphics
// Original from http://www.onemoresoftwareblog.com/2011/11/finding-convex-hull-using-grahams-scan_19.html
// Modified to accept array of paper Segments and convert them to Points with around a set origin (object center)

var GrahamScan = {

   execute : function(segments, origin, scale) {
      var points = [];
      
      for(var i = 0; i < segments.length; i++) {
         points.push(segments[i].point.subtract(origin).divide(scale));
      }
      
      if (points.length < 3) { 
         return points; 
      } 
      
  
      var minimum = function(Q) { 
         // Find minimum y point (in case of tie seleft leftmost)         
         // Sort by y coordinate to ease the left most finding
         Q.sort(function(a,b) { 
            return a.y - b.y; 
         }); 

         var y_min = 1000000; 
         var smallest = 0; 
         for(var i=0; i < Q.length; ++i) { 
            var p = Q[i]; 
            if (p.y < y_min) { 
               y_min = p.y; smallest= i; 
            } 
            else if (p.y == y_min) { // Select left most 
               if (Q[i-1].x > p.x) {
                  smallest = i;
               }
            }
         }
      return smallest;
      }

      var distance = function(a, b) {
         return (b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y);
      }

      var filter_equal_angles = function(p0, Q) {
         // => If two points have same polar angle remove the farthest from p0
         // Distance can be calculated with vector length...
         for(var i=1; i < Q.length; i++) { 
            if (Q[i-1].polar == Q[i].polar) { 
               var d1 = distance(p0, Q[i-1]); 
               var d2 = distance(p0, Q[i]); 
               if (d2 > d1) {
                  Q.splice(i, 1);
               } else {
                  Q.splice(i-1, 1);
               }
            }
         }
      }

      var cartesian_angle = function(x, y) {
         if (x > 0 && y > 0)
            return Math.atan( y / x);
         else if (x < 0 && y > 0)
            return Math.atan(-x / y) + Math.PI / 2;
         else if (x < 0 && y < 0) 
            return Math.atan( y / x) + Math.PI; 
         else if (x > 0 && y < 0) 
            return Math.atan(-x / y) + Math.PI / 2 + Math.PI; 
         else if (x == 0 && y > 0)
            return Math.PI / 2;
         else if (x < 0 && y == 0) 
            return Math.PI; 
         else if (x == 0 && y < 0) 
            return Math.PI / 2 + Math.PI; 
         else return 0; 
      } 
    
      var calculate_angle = function(p1, p2) { 
         return cartesian_angle(p2.x - p1.x, p2.y - p1.y) 
      } 

      var calculate_polar_angles = function(p0, Q) { 
         for(var i=0; i < Q.length; i++) { 
            Q[i].polar = calculate_angle(p0, Q[i]); 
         }    
      } 

      // Three points are a counter-clockwise turn 
      // if ccw > 0, clockwise if ccw < 0, and collinear if ccw = 0 
      var ccw = function(p1, p2, p3) { 
         return (p2.x - p1.x)*(p3.y - p1.y) - (p2.y - p1.y)*(p3.x - p1.x); 
      } 
     
      // Find minimum point 
      var Q = points.concat(); // Make copy 
      var min = minimum(Q); 
      var p0 = Q[min]; 
      Q.splice(min, 1); 
    
      // Sort by polar angle to p0              
      calculate_polar_angles(p0, Q); 
      Q.sort(function(a,b) { 
         return a.polar - b.polar; 
      }); 

      // Remove all with same polar angle but the farthest. 
      filter_equal_angles(p0, Q); 

      // Graham scan 
      var S = []; 
      S.push(p0); 
      S.push(Q[0]); 
      S.push(Q[1]); 
      for(var i=2; i < Q.length; ++i) { 
         var pi = Q[i]; 
         while(ccw(S[S.length - 2], S[S.length - 1], pi) <= 0) { 
            S.pop(); 
         } 
         S.push(pi); 
      } 
      return S; 
   } 
};