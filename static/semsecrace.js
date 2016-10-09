function scalePage() {
    var size = Math.min(document.documentElement.clientWidth,
                        document.documentElement.clientHeight);
    var canvas = document.getElementById("canvas");
    canvas.setAttribute("width", size);
    canvas.setAttribute("height", size);
    centerElement(canvas);
    centerElement(document.getElementById("drugstore"))
    centerElement(document.getElementById("game-over"))
    changeState("current");
}

function centerElement(elem) {
    var left = (document.documentElement.clientWidth - elem.offsetWidth)/2;
    elem.style.left = left + 'px';
    var top = (document.documentElement.clientHeight - elem.offsetHeight)/2;
    elem.style.top = top + 'px';
}

function animateNormal() {
    var carColor = state["color"] == "red" ? 0 : 1;
    var carCompletion = state['stage'] / numStages;
    preloadAssets(function(images) {
        renderScene(carCompletion, carColor, false, images);
    });
}

function animateBurn() {
    preloadAssets(function(images) {
        state["animationInterval"] = setInterval(function() {
            var carColor = state["color"] == "red" ? 0 : 1;
            var carCompletion = state['stage'] / numStages;
            renderScene(carCompletion, carColor, true, images);
        }, 100);
    });
}

function animateDrive(colorColor) {
    var duration = 500;
    var fps = 30;
    var numFrames = parseInt(duration / 1000 * fps, 10) + 1;
    var currentFrame = 0;
    
    var carCompletion = state['stage'] / numStages;
    var carColor = state["color"] == "red" ? 0 : 1;
    var colorDir = 0;
    if (state["color"] != colorColor) {
        colorDir = colorColor == "red" ? -1 : 1;
    } 
    preloadAssets(function(images) {
        state["animationInterval"] = setInterval(function() {
            if (currentFrame > numFrames && state["animationInterval"] !== null) {
                clearInterval(state["animationInterval"]);
                return;
            }
            var progress = currentFrame / numFrames;
            renderScene(carCompletion + 1/numStages*progress, carColor + colorDir*progress, false, images);
            currentFrame++;
        }, 1000/fps);
    });
}

function animateFlag() {
    var fps = 30;
    var numFrames = 50;
    var cnt = {'frame': 0}
    preloadAssets(function(images) {
        setInterval(function() {
            var carCompletion = cnt['frame'] / numFrames;
            var carColor = Math.abs(Math.sin(carCompletion*2*Math.PI))
            renderScene(carCompletion, carColor, false, images);
            cnt['frame'] = (cnt['frame']+1) % numFrames;
        }, 1000/fps);
    })
}

function displayGameOver(text) {
    document.getElementById("drugstore").style.display = 'none';
    var gameOver = document.getElementById("game-over");
    gameOver.style.display = 'block';
    document.getElementById("game-over-text").innerHTML = text;
    centerElement(gameOver);
}


function changeState(action, text) {
    if (state["animationInterval"] !== null) {
        clearInterval(state["animationInterval"]);
    }

    if (action == "current") {
        if (state["mode"] == "burn" || state["mode"] == "expired") {
            action = state["mode"];
        } else {
            animateNormal();
        }
    }
    
    if (action == "burn") {
        state["mode"] = "burn";
        animateBurn();
        displayGameOver("You took the wrong color.");
    } else if (action == "expired") {
        state["mode"] = "expired";
        animateBurn();
        displayGameOver("Your driver license expired.");
    } else if (action == "blue" || action == "red") {
        animateDrive(action);
        state["color"] = action;
        state['stage'] += 1;
    } else if (action == "flag") {
        animateFlag();
    }
}

function takeColor(color) {
    var req = new XMLHttpRequest();
    req.onreadystatechange = function() {
        if (req.readyState == 4 && req.status == 200) {
            var resp = JSON.parse(req.responseText);
            if (resp["action"] != "flag") {
                changeState(resp["action"]);
            } else {
                changeState("flag");
                displayGameOver(resp["text"]);
            }
        }
    }
    req.open("POST", "/choose?driver_license=" + state["license"] + "&color=" + color);
    req.send();
}

function play() {
    window.addEventListener("resize", scalePage, false);
    scalePage();
    changeState("current");
    document.getElementById("form-red").addEventListener("submit", function(ev) {
        takeColor("red");
        ev.stopPropagation();
        ev.preventDefault();
        return false;
    });
    document.getElementById("form-blue").addEventListener("submit", function(ev) {
        takeColor("blue");
        ev.stopPropagation();
        ev.preventDefault();
        return false;
    });
}

function preloadAssets(finishCb) {
    if (state["images"] != null) {
        finishCb(state["images"]);
        return;
    }
    var images = {};
    var redCarImg = new Image();
    redCarImg.onload = function() {
        images['redcar'] = this;
        var blueCarImg = new Image();
        blueCarImg.onload = function() {
            images['bluecar'] = this;
            var fireImg = new Image();
            fireImg.onload = function() {
                images['fire'] = this;
                var goalImg = new Image();
                goalImg.onload = function() {
                    images["goal"] = this;
                    state["images"] = images;
                    finishCb(images);
                }
                goalImg.src = "/static/goal.png";
            }
            fireImg.src = "/static/fire.png";
        }
        blueCarImg.src = "/static/bluecar.png";
    }
    redCarImg.src = "/static/redcar.png";
}


function renderScene(carCompletion, carColor, showFire, images) {
    var canvas = document.getElementById('canvas');
    var parent = canvas.parentNode;
    parent.removeChild(canvas);
    var ctx = canvas.getContext('2d');
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var size = parseInt(canvas.getAttribute("width"), 10);
    var sizeFactor = size / 800;

    var grassPath = new Path2D();
    grassPath.arc(size/2,size/2, (size/2)-10,0,Math.PI*2,true);
    ctx.fillStyle = 'rgb(0, 150, 0)';
    ctx.fill(grassPath);
    
    var grassCenterPath = new Path2D();
    grassCenterPath.arc(size/2,size/2, ((size/2.5)-10)/2,0,Math.PI*2,true);
    ctx.fillStyle = 'rgb(220, 220, 220)';
    ctx.stroke(grassCenterPath);
    ctx.fill(grassCenterPath);

    var roadPath = new Path2D();
    roadPath.arc(size/2,size/2, ((size/1.35)-10)/2,0,Math.PI*2,true);
    ctx.lineWidth = size/7;
    ctx.stroke(roadPath);
    
    var numLines = 10;
    ctx.strokeStyle = 'rgb(255, 255, 255)';
    ctx.lineWidth = size/50;
    for (var i = 0; i < numLines; i++) {
        var roadLinesPath = new Path2D();
        var start =  i*(2*Math.PI/numLines);
        var stop =  start + 0.4; //(2*Math.PI/numLines) - 0.3;
        roadLinesPath.arc(size/2, size/2, ((size/1.35)-10)/2, start, stop, false);
        ctx.stroke(roadLinesPath);
    }

    // Draw goal
    ctx.save();
    ctx.translate(size/2, 0.75*size);
    ctx.scale(0.8 * sizeFactor, 0.8 * sizeFactor);
    ctx.drawImage(images["goal"], -100, -63);
    ctx.restore();

    // Calculate car position
    var carX = 0.725*Math.sin(2*Math.PI*carCompletion)*size/2 + size/2;
    var carY = 0.725*Math.cos(2*Math.PI*carCompletion)*size/2 + size/2;
    
    // Draw car
    ctx.save();
    ctx.translate(carX, carY);
    ctx.rotate(-2*Math.PI*carCompletion);
    ctx.scale(0.8 * sizeFactor, 0.8 * sizeFactor);
    ctx.drawImage(images['bluecar'], -100, -50);
    ctx.globalAlpha = 1.0-carColor;
    ctx.drawImage(images['redcar'], -100, -50);
    ctx.restore();
    
    if (showFire) {
        ctx.save();
        var fireImg = images["fire"];
        // Wiggle a little
        var positionOffset = (Math.random()-0.5) * 0.02 * size;
        ctx.translate(carX + positionOffset, carY + positionOffset);
        ctx.rotate((Math.random()-0.5)*2*Math.PI*0.14);
        var scaleOffset = Math.random() * 0.1;
        ctx.scale((0.65 + scaleOffset) * sizeFactor, (0.65 + scaleOffset) * sizeFactor);
        ctx.globalAlpha = Math.random() * 0.5 + 0.5;
        ctx.drawImage(fireImg, -90, -200);
        ctx.restore();
    }
    

    // Reset everything
    ctx.restore();
    parent.appendChild(canvas);
}

document.addEventListener("DOMContentLoaded", function(ev) {
    play();
}, false);
