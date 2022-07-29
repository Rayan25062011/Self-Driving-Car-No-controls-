class Sensors {
  constructor(car) {
    this.car = car;
    this.rayCount = 5;
    this.rayLength = 150; // mean the range of each individual ray
    this.raySpread = Math.PI / 2; // the angle between rays - Math.PI / 4 = 45 degree

    this.rays = [];
    this.readings = []; //this responsible to tell/store for each ray if it close/near to any border or not
  }
  update(roadBorders, traffic) {
    this.#raysConfig();
    this.readings = [];
    for (let i = 0; i < this.rayCount; i++) {
      this.readings.push(this.#getReading(this.rays[i], roadBorders, traffic));
    }
  }
  #getReading(ray, roadBorders, traffic) {
    let touches = []; //to store all intersection point of the ray and other component in the track
    for (let i = 0; i < roadBorders.length; i++) {
      //ray[0] - start point of ray, ray[1], end point on the ray
      const touch = getIntersection(
        ray[0],
        ray[1],
        roadBorders[i][0],
        roadBorders[i][1]
      ); // we send the ray x and y coordinates , and the border coordinates
      if (touch) {
        // if we find a touch then store it
        touches.push(touch);
      }
    }
    //to make sensors detect any traffic
    for (let i = 0; i < traffic.length; i++) {
      const poly = traffic[i].polygon;
      for (let j = 0; j < poly.length; j++) {
        const value = getIntersection(
          ray[0],
          ray[1],
          poly[j],
          poly[(j + 1) % poly.length]
        );
        if (value) {
          touches.push(value);
        }
      }
    }
    if (touches.length === 0) {
      return null;
    } else {
      /**
       * 1- we extract all the offsets (the distance between the center of the car and the intersection)
       * 2- find the minimum distance among them
       * 3- return the intersect that has the minimum intersection
       */
      const offsets = touches.map((element) => element.offset);
      const minOffset = Math.min(...offsets);
      return touches.find((element) => element.offset === minOffset);
    }
  }
  #raysConfig() {
    this.rays = [];
    for (let i = 0; i < this.rayCount; i++) {
      const rayAngle =
        linearInterpolation(
          this.raySpread / 2,
          -this.raySpread / 2,
          this.rayCount == 1 ? 0.5 : i / (this.rayCount - 1)
        ) + this.car.angle; //we add this.car.angle to th linear Interpolation to make these sensors lines move and rotate with the car

      const start = { x: this.car.x, y: this.car.y }; // basically the middle point of the car
      const end = {
        x: this.car.x - Math.sin(rayAngle) * this.rayLength,
        y: this.car.y - Math.cos(rayAngle) * this.rayLength,
      };
      this.rays.push([start, end]); // as segment
    }
  }
  draw(canvasCtx) {
    for (let i = 0; i < this.rayCount; i++) {
      let end = this.rays[i][1];
      if (this.readings[i]) {
        end = this.readings[i];
      }
      canvasCtx.beginPath();
      canvasCtx.lineWidth = 2;
      canvasCtx.strokeStyle = "yellow";
      canvasCtx.moveTo(this.rays[i][0].x, this.rays[i][0].y);
      canvasCtx.lineTo(end.x, end.y);
      canvasCtx.stroke();

      canvasCtx.beginPath();
      canvasCtx.lineWidth = 2;
      canvasCtx.strokeStyle = "black";
      canvasCtx.moveTo(this.rays[i][1].x, this.rays[i][1].y);
      canvasCtx.lineTo(end.x, end.y);
      canvasCtx.stroke();
    }
  }
}
class Controls {
  constructor(controlType) {
    // 4 - direction
    this.forward = false;
    this.reverse = false;
    this.right = false;
    this.left = false;

    //different control for different type of car - main or traffic
    switch (controlType) {
      case "KEYS":
        this.#addKeyboardListeners();
        break;
      case "DUMMY":
        this.forward = true;
        break;
    }
  }

  #addKeyboardListeners() {
    document.addEventListener("keydown", (event) => {
      switch (event.key) {
        case "ArrowRight":
          this.right = true;
          break;
        case "ArrowLeft":
          this.left = true;
          break;
        case "ArrowUp":
          this.forward = true;
          break;
        case "ArrowDown":
          this.reverse = true;
          break;
      }
    });

    document.addEventListener("keyup", (event) => {
      switch (event.key) {
        case "ArrowRight":
          this.right = false;
          break;
        case "ArrowLeft":
          this.left = false;
          break;
        case "ArrowUp":
          this.forward = false;
          break;
        case "ArrowDown":
          this.reverse = false;
          break;
      }
    });
  }
}
class Car {
  // controlType = "KEYS" OR "DUMMY" ---- KEYS THE MAIN ONE, DUMMY THE TRAFFIC
  constructor(x, y, width, height, controlType, maxSpeed = 3, color = "blue") {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    /**
     * To make car move like Real car we need speed and acceleration
     */
    this.speed = 0;
    this.acceleration = 0.2;

    this.maxSpeed = maxSpeed;
    this.friction = 0.05;

    // for rotate the car left or right
    this.angle = 0;

    this.useBrain = controlType == "AI";
    //for sensors
    if (controlType !== "DUMMY") {
      this.sensors = new Sensors(this);
      //we specified the layers of out neural network
      //input - rayCounts, hidden - 6-neurons, output - 4-neurons {represent direction}
      this.brain = new NeuralNetwork([this.sensors.rayCount, 6, 4]);
    }

    //to make car more nicer :*
    this.img = new Image();
    this.img.src = "car.png";

    //to colorize our cars
    this.mask = document.createElement("canvas");
    this.mask.width = width;
    this.mask.height = height;

    const maskCtx = this.mask.getContext("2d");
    this.img.onload = () => {
      maskCtx.fillStyle = color;
      maskCtx.rect(0, 0, this.width, this.height);
      maskCtx.fill();

      maskCtx.globalCompositeOperation = "destination-atop";
      maskCtx.drawImage(this.img, 0, 0, this.width, this.height);
    };
    //to control car movement -- we pass {controlType} to the control class to specify
    //                           which car is the main car(in other word which car is the one we want to control it with keys)
    this.controls = new Controls(controlType);
  }

  /**
   * update()
   * used to update the position of car
   */
  update(roadBorders, traffic) {
    //if the car damaged stop every thing !
    if (!this.damaged) {
      this.#move();
      //for car shape
      this.polygon = this.#createPolygon();
      //to detect damaged from the border of the road and other traffic
      this.damaged = this.#assessDamage(roadBorders, traffic);
    }
    if (this.sensors) {
      this.sensors.update(roadBorders, traffic);
      /**
       * here we iterate through all readings of sensors,
       * and if the reading is null {theres no object detected by sensor} then return 0
       * but if not we return {1 - read.offset} because i want neurons receive high values with near object and low one's with far object
       */
      const offsets = this.sensors.readings.map((read) => {
        return read === null ? 0 : 1 - read.offset;
      });
      const output = NeuralNetwork.feedForward(offsets, this.brain);
      // console.log(output);
      if (this.useBrain) {
        this.controls.forward = output[0];
        this.controls.left = output[1];
        this.controls.right = output[2];
        this.controls.reverse = output[3];
      }
    }
  }
  /**
   * Detect any crash between the main car(polygon) with the road borders and the traffic car
   * @param {array} roadBorders
   * @param {array} traffic - punch of cars represent traffic
   * @returns {boolean} - true if theres a damage, false otherwise
   */
  #assessDamage(roadBorders, traffic) {
    // to detect damage when crash with road boarders
    for (let i = 0; i < roadBorders.length; i++) {
      if (polysIntersect(this.polygon, roadBorders[i])) {
        return true;
      }
    }
    // to detect damage when crash with traffic
    for (let i = 0; i < traffic.length; i++) {
      if (polysIntersect(this.polygon, traffic[i].polygon)) {
        return true;
      }
    }
    return false;
  }
  #move() {
    if (this.controls.forward) {
      this.speed += this.acceleration;
    }
    if (this.controls.reverse) {
      this.speed -= this.acceleration;
    }

    // to control the max speed could car reach FORWARD
    if (this.speed > this.maxSpeed) {
      this.speed = this.maxSpeed;
    }

    // to control the max speed could car reach BACKWARD
    if (this.speed < -this.maxSpeed / 2) {
      this.speed = -this.maxSpeed / 2;
    }

    //to make car stop after releasing the button
    // for forward movement
    if (this.speed > 0) {
      this.speed -= this.friction;
    }
    // for backward movement
    if (this.speed < 0) {
      this.speed += this.friction;
    }

    /**
     * (this.speed != 0) then car is move so we can rotate but if it not then we can not rotate
     */
    if (this.speed != 0) {
      // this flip constant to make rotate look like real life in reverse
      const flip = this.speed > 0 ? 1 : -1;
      //for left movement
      if (this.controls.left) {
        this.angle += 0.03 * flip;
      }
      //for right movement
      if (this.controls.right) {
        this.angle -= 0.03 * flip;
      }
    }

    //to fix very small movement (when we click and release instantly)
    if (Math.abs(this.speed) < this.friction) {
      this.speed = 0;
    }

    //to make the car move depends on what angle it rotated
    this.x -= Math.sin(this.angle) * this.speed; // we put sine here because in the unit circle the sine present in x-axis
    this.y -= Math.cos(this.angle) * this.speed; // we put cosine here because in the unit circle the cosine present in y-axis
  }

  /**
   * @returns {array} - the coordinates of the coroners of the polygon (car)
   */
  #createPolygon() {
    //The corners of the polygon
    const points = [];
    //hypot -- used to find the sqrt of the sum of arg^2 ==> sqrt(arg1^2 + arg3^2 + arg3^2 + .....);
    //we divide by two because we want radius not diameter
    const rad = Math.hypot(this.width, this.height) / 2;

    //atan2 -- used to find the angle between the x-axis(width) and y-axis(height)
    const alpha = Math.atan2(this.width, this.height);

    //top right point
    points.push({
      x: this.x - Math.sin(this.angle - alpha) * rad,
      y: this.y - Math.cos(this.angle - alpha) * rad,
    });

    //top left point
    points.push({
      x: this.x - Math.sin(this.angle + alpha) * rad,
      y: this.y - Math.cos(this.angle + alpha) * rad,
    });

    //bottom left point
    points.push({
      x: this.x - Math.sin(Math.PI + this.angle - alpha) * rad,
      y: this.y - Math.cos(Math.PI + this.angle - alpha) * rad,
    });

    //bottom right point
    points.push({
      x: this.x - Math.sin(Math.PI + this.angle + alpha) * rad,
      y: this.y - Math.cos(Math.PI + this.angle + alpha) * rad,
    });

    return points;
  }

  draw(canvasCtx, color, drawSensors = false) {
    /**
     * this commented code below if we want to draw car as polygon
     */
    // if (this.damaged) {
    //   canvasCtx.fillStyle = "gray";
    // } else {
    //   canvasCtx.fillStyle = color;
    // }
    // canvasCtx.beginPath();
    // // it is like move the pencel to begin draw
    // canvasCtx.moveTo(this.polygon[0].x, this.polygon[0].y);

    // //draw lines to all other points of polygon
    // for (let i = 1; i < this.polygon.length; i++) {
    //   canvasCtx.lineTo(this.polygon[i].x, this.polygon[i].y);
    // }
    // canvasCtx.fill();

    //draw sensors of the specific car
    if (this.sensors && drawSensors) {
      this.sensors.draw(canvasCtx);
    }

    /**
     * this code below if we want to draw a car as an image
     */

    canvasCtx.save();
    canvasCtx.translate(this.x, this.y);
    canvasCtx.rotate(-this.angle);
    if (!this.damaged) {
      canvasCtx.drawImage(
        this.mask,
        -this.width / 2,
        -this.height / 2,
        this.width,
        this.height
      );
      canvasCtx.globalCompositeOperation = "multiply";
    }
    canvasCtx.drawImage(
      this.img,
      -this.width / 2,
      -this.height / 2,
      this.width,
      this.height
    );
    canvasCtx.restore();
  }
}
class Road {
  constructor(x, width, laneCount = 3) {
    this.x = x;
    this.width = width;
    this.laneCount = laneCount;

    this.left = x - width / 2;
    this.right = x + width / 2;

    const infinity = 1000000;

    this.top = -infinity;
    this.bottom = infinity;
    const topLeft = { x: this.left, y: this.top };
    const topRight = { x: this.right, y: this.top };
    const bottomLeft = { x: this.left, y: this.bottom };
    const bottomRight = { x: this.right, y: this.bottom };
    this.borders = [
      [topLeft, bottomLeft],
      [topRight, bottomRight],
    ];
  }
  getLaneCenter(laneIndex) {
    const laneWidth = this.width / this.laneCount;
    return (
      this.left +
      laneWidth / 2 +
      laneWidth * Math.min(laneIndex, this.laneCount - 1)
    );
  }

  draw(canvasCtx) {
    canvasCtx.lineWidth = 5;
    canvasCtx.strokeStyle = "white";
    for (let i = 0; i <= this.laneCount; i++) {
      let x = linearInterpolation(this.left, this.right, i / this.laneCount);

      if (i > 0 && i < this.laneCount) {
        canvasCtx.setLineDash([20, 20]);
      } else {
        canvasCtx.setLineDash([]);
      }
      canvasCtx.beginPath();
      canvasCtx.moveTo(x, this.top);
      canvasCtx.lineTo(x, this.bottom);
      canvasCtx.stroke();
    }
  }
}
