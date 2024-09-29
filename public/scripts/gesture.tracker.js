export default class GestureTracker extends EventTarget
{
	constructor(element)
	{
		super();

		this._element = element;

		this._mouseDown = false;
		this._mouseMoved = false;

		this._lastMouseX = 0;
		this._lastMouseY = 0;

		this._lastDistanceToCenter = 0;

		this.onpan = null;
		this.onclick = null;
		this.onzoom = null;

		this._setupMouse();
		this._setupTouch();
	}

	static attach(element)
	{
		return new GestureTracker(element);
	}

	_onpan(event)
	{
		this.onpan?.(event);
		this.dispatchEvent(new CustomEvent("pan", { detail: event }));
	}

	_onclick(event)
	{
		this.onclick?.(event);
		this.dispatchEvent(new CustomEvent("click", { detail: event }));
	}

	_onzoom(event)
	{
		this.onzoom?.(event);
		this.dispatchEvent(new CustomEvent("zoom", { detail: event }));
	}

	_setupMouse()
	{
		// every time the mouse is pressed...
		this._element.addEventListener("mousedown", e =>
		{
			this._mouseDown = true;
			this._mouseMoved = false;
		
			this._lastMouseX = e.clientX;
			this._lastMouseY = e.clientY;
		});
		
		// every time the mouse is moved...
		this._element.addEventListener("mousemove", e =>
		{
			// ...only proceed if the mouse is being held down
			if(!this._mouseDown)
			{
				return;
			}

			this._mouseMoved = true;

			// ...trigger the pan event and calculate the amount moved
			this._onpan({ deltaX: e.clientX - this._lastMouseX, deltaY: e.clientY - this._lastMouseY });
	
			this._lastMouseX = e.clientX;
			this._lastMouseY = e.clientY;
		});
		
		// every time the mouse is unpressed...
		this._element.addEventListener("mouseup", e =>
		{
			this._mouseDown = false;

			// ...only trigger the click event if the mouse hasn't moved
			if(!this._mouseMoved)
			{
				this._onclick({ x: e.clientX, y: e.clientY, button: e.button });
			}
		});

		this._element.addEventListener("mouseleave", () =>
		{
			this._mouseDown = false;
		});

		this._element.addEventListener("wheel", e =>
		{
			this._onzoom({ factor: e.deltaY > 0 ? 0.5 : 2.0, x: e.clientX, y: e.clientY });
		});
	}

	_setupTouch()
	{
		// calculates the centroid of the set of passed in touch points
		function touchCentroid(touches)
		{
			let centerX = 0;
			let centerY = 0;

			for(const touch of touches)
			{
				centerX += touch.clientX;
				centerY += touch.clientY;
			}

			centerX /= touches.length;
			centerY /= touches.length;

			return [ centerX, centerY ];
		}

		// calculates the average approximate distance of the set of passed in touch points to the given origin
		function averageDistanceTo(touches, centerX, centerY)
		{
			let averageDistance = 0;

			for(const touch of touches)
			{
				// approximate the distance - accuracy won't matter as we'll be taking the ratio between distances anyway
				averageDistance += Math.abs(centerX - touch.clientX) + Math.abs(centerY - touch.clientY);
			}

			averageDistance /= touches.length;

			return averageDistance;
		}

		// every time a finger is placed on the screen...
		this._element.addEventListener("touchstart", e =>
		{
			// ...make sure to cancel all the mouse events
			e.preventDefault();

			// ...recalculate the "mouse" position to be in the center of all touch points
			[ this._lastMouseX, this._lastMouseY ] = touchCentroid(e.touches);



			// if this is the first finger to be placed on the screen...
			if(e.touches.length <= 1)
			{
				// ...reset the 'moved' variable
				this._mouseMoved = false;
				return;
			}

			// if there's already a finger on the screen and another is placed...

			// ...pretend the mouse has "moved" so that it doesn't count as a click
			this._mouseMoved = true;

			// ...recalculate the average distance of a touch to the mouse
			this._lastDistanceToCenter = averageDistanceTo(e.touches, this._lastMouseX, this._lastMouseY);
		});

		// every time fingers are moved across the screen...
		this._element.addEventListener("touchmove", e =>
		{
			e.preventDefault();

			const [ centerX, centerY ] = touchCentroid(e.touches);

			// ...trigger the pan event and calculate the amount moved
			this._onpan({ deltaX: centerX - this._lastMouseX, deltaY: centerY - this._lastMouseY });

			// ...don't forget to recalculate the new mouse position
			this._lastMouseX = centerX;
			this._lastMouseY = centerY;

			this._mouseMoved = true;



			// if there's more than one finger on the screen...
			if(e.touches.length < 2)
			{
				return;
			}

			// ...calculate the ratio between the last and current distance to the mouse
			let currentDistance = averageDistanceTo(e.touches, this._lastMouseX, this._lastMouseY);
			const factor = currentDistance / this._lastDistanceToCenter;

			// ...trigger the zoom event and use the calculated ratio as the zoom factor
			this._onzoom({ factor, x: centerX, y: centerY });

			// ...don't forget to recalculate the new distance to the mouse
			this._lastDistanceToCenter = currentDistance;
		});

		// every time a finger is lifted off the screen...
		this._element.addEventListener("touchend", e =>
		{
			e.preventDefault();

			const oldX = this._lastMouseX;
			const oldY = this._lastMouseY;

			// ...don't forget to recalculate the new mouse position
			[ this._lastMouseX, this._lastMouseY ] = touchCentroid(e.touches);



			// only if there are no more fingers on the screen...
			if(e.touches.length <= 0)
			{
				// ...and no fingers have moved ever since the first touch
				if(!this._mouseMoved)
				{
					// ...then trigger the click event (with the last mouse position since now there are no touch points)
					this._onclick({ x: oldX, y: oldY, button: 0 });
				}

				return;
			}

			// if there are still fingers on the screen...

			// ...don't forget to recalculate the new distance to the mouse
			this._lastDistanceToCenter = averageDistanceTo(e.touches, this._lastMouseX, this._lastMouseY);
		});
	}
}