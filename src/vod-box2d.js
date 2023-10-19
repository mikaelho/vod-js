(function() {
var b2Vec2 = Box2D.Common.Math.b2Vec2;
var b2BodyDef = Box2D.Dynamics.b2BodyDef;
var b2Body = Box2D.Dynamics.b2Body;
var b2FixtureDef = Box2D.Dynamics.b2FixtureDef;
var b2Fixture = Box2D.Dynamics.b2Fixture;
var b2World = Box2D.Dynamics.b2World;
var b2MassData = Box2D.Collision.Shapes.b2MassData;
var b2PolygonShape = Box2D.Collision.Shapes.b2PolygonShape;
var b2CircleShape = Box2D.Collision.Shapes.b2CircleShape;
var b2DebugDraw = Box2D.Dynamics.b2DebugDraw;

var Physics = window.Physics = function(scale) {
	var gravity = new b2Vec2(0, 0);
	this.world = new b2World(gravity, true);
	this.scale = scale || 30;
	this.dtRemaining = 0;
	this.stepAmount = 1/30;
};

var Body = window.Body = function (physics, details, userData) {
    this.details = details = details || {};

    // Create the definition
    this.definition = new b2BodyDef();

    // Set up the definition
    for (var k in this.definitionDefaults) {
        this.definition[k] = details[k] || this.definitionDefaults[k];
    }
    this.definition.position = new b2Vec2(details.x || 0, details.y || 0);
    this.definition.linearVelocity = new b2Vec2(details.vx || 0, details.vy || 0);
    this.definition.userData = userData;
    this.definition.type = details.type == "static" ? b2Body.b2_staticBody : b2Body.b2_dynamicBody;

    // Create the Body
    this.body = physics.world.CreateBody(this.definition);

    // Create the fixture
    this.fixtureDef = new b2FixtureDef();
    for (var l in this.fixtureDefaults) {
        this.fixtureDef[l] = details[l] || this.fixtureDefaults[l];
    }


    details.shape = details.shape || this.defaults.shape;

    switch (details.shape) {
        case "circle":
            details.radius = details.radius || this.defaults.radius;
            this.fixtureDef.shape = new b2CircleShape(details.radius);
            break;
        case "polygon":
            this.fixtureDef.shape = new b2PolygonShape();
            this.fixtureDef.shape.SetAsArray(details.points, details.points.length);
            break;
        case "block":
        default:
            details.width = details.width || this.defaults.width;
            details.height = details.height || this.defaults.height;

            this.fixtureDef.shape = new b2PolygonShape();
            this.fixtureDef.shape.SetAsBox(details.width / 2,
            details.height / 2);
            break;
    }

    this.body.CreateFixture(this.fixtureDef);
};


Body.prototype.defaults = {
    shape: "block",
    width: 5,
    height: 5,
    radius: 2.5
};

Body.prototype.fixtureDefaults = {
    density: 2,
    friction: 1,
    restitution: 1,
    isSensor: false
};

Body.prototype.definitionDefaults = {
    active: true,
    allowSleep: true,
    angle: 0,
    angularVelocity: 0,
    awake: true,
    bullet: false,
    fixedRotation: false
};

Physics.prototype.debug = function() {
    this.debugDraw = new b2DebugDraw();
    this.debugDraw.SetSprite($("#box2DDebug")[0].getContext("2d"));
    this.debugDraw.SetDrawScale(this.scale);
    //this.debugDraw.SetDrawScale(this.scale*game.currentScale);
    this.debugDraw.SetFillAlpha(0.3);
    this.debugDraw.SetLineThickness(1.0);
    this.debugDraw.SetFlags(b2DebugDraw.e_shapeBit | b2DebugDraw.e_jointBit);
    this.world.SetDebugDraw(this.debugDraw);
};

Physics.prototype.collision = function () {
    this.listener = new Box2D.Dynamics.b2ContactListener();
    this.listener.BeginContact = function (contact) {
    	//dbg("begincontact");
        var bodyA = contact.GetFixtureA().GetBody().GetUserData(),
            bodyB = contact.GetFixtureB().GetBody().GetUserData();
 
        if (bodyA.beginContact) {
            bodyA.beginContact(contact, bodyB);
        }
        if (bodyB.beginContact) {
            bodyB.beginContact(contact, bodyA);
        }
 
    };
    this.listener.EndContact = function (contact) {
    	//dbg("endcontact");
        var bodyA = contact.GetFixtureA().GetBody().GetUserData(),
            bodyB = contact.GetFixtureB().GetBody().GetUserData();
 
        if (bodyA.endContact) {
            bodyA.endContact(contact, bodyB);
        }
        if (bodyB.endContact) {
            bodyB.endContact(contact, bodyA);
        }
 
    };
    this.world.SetContactListener(this.listener);
    
    this.filter = new Box2D.Dynamics.b2ContactFilter();
    this.filter.ShouldCollide = function (fixtureA, fixtureB) {
        var objA = fixtureA.GetBody().GetUserData(),
            objB = fixtureB.GetBody().GetUserData();
 
        if (objA.isA(particle) && objB.isA(particle)) {
            if (objA.collisionId == objB.collisionId) {
            	return false;
            }   
            return true;
        }
        
        if (objA.isA(particle)) {
        	if (objB.id() == objA.collisionId) {
        		return false;
        	}
        	return true;
        }
        
        if (objB.isA(particle)) {
        	if (objA.id() == objB.collisionId) {
        		return false;
        	}
        	return true;
        }
        
 		return true;
    };/*
    this.filter.RayCollide = function (data, fixture) {
        var obj = fixture.GetBody().GetUserData(),
            objB = fixtureB.GetBody().GetUserData();*/
    this.world.SetContactFilter(this.filter);
};

/*
Physics.prototype.step = function (dt) {
	this.dtRemaining += dt;
	while (this.dtRemaining > this.stepAmount) {
		this.dtRemaining -= this.stepAmount;
		this.world.Step(this.stepAmount,
			8, // velocity iterations
			3); // position iterations
		this.updateDisplay();
	}
};
*/

Physics.prototype.step = function (dt) {
	this.dtRemaining += dt;
	//dbg("entering while");
	while (this.dtRemaining > this.stepAmount) {
		this.dtRemaining -= this.stepAmount;
		//dbg("entering world step");
		this.world.Step(this.stepAmount,
			8, // velocity iterations
			3); // position iterations
		this.updateQueue();
	}
	//dbg("step out");
};

Physics.prototype.updateQueue = function() {
	//dbg("getting bodies");
	var obj = this.world.GetBodyList();
	while (obj) {
		var spaceObject = obj.GetUserData();
		if (obj.IsActive() && spaceObject) {
			//dbg("queue in");
			spaceObject.updateQueue(obj.GetPosition(), radToDeg(obj.GetAngle()));
			//dbg("queue out");
		}
		obj = obj.GetNext();
	}
	//dbg("updqueue out");
}

Physics.prototype.updateDisplay = function() {
	var obj = this.world.GetBodyList();
	while (obj) {
		var spaceObject = obj.GetUserData();
		if (obj.IsActive() && spaceObject) {
			spaceObject.update(obj.GetPosition(), radToDeg(obj.GetAngle()));
			//game.record
		}
		obj = obj.GetNext();
	}
	if (physics.showDebug && this.debugDraw) {
		this.world.DrawDebugData();
	}
}

}());
