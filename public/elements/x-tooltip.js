function executeTimeout(func, millis)
{
	if (millis) return setTimeout(func, millis);
	return void func();
}

class Showable
{
	constructor(element)
	{
		this._element = element;
		this._showInMillis = 0;
		this._showForMillis = 0;
		this._showInTimeout = null;
		this._showForTimeout = null;
		this._onshow = null;
	}

	in(millis)
	{
		this._showInMillis = millis;
		return this;
	}

	for(millis)
	{
		this._showForMillis = millis;
		return this;
	}

	go()
	{
		const showInMillis = this._showInMillis;
		const showForMillis = this._showForMillis;

		this.clear();

		const showFor = async () =>
		{
			if (await this._onshow?.() === false) return;
			this._element.classList.remove("faded");
			if (showForMillis) this._showForTimeout = setTimeout(() => this._element.classList.add("faded"), showForMillis);
		};

		if (showInMillis) this._showInTimeout = setTimeout(showFor, showInMillis);
		else showFor();

		return this;
	}

	onShow(func)
	{
		this._onshow = func;
		return this;
	}

	clear()
	{
		this._element.classList.add("faded");
		this._showInMillis = 0;
		this._showForMillis = 0;
		this._showInTimeout = clearTimeout(this._showInTimeout);
		this._showForTimeout = clearTimeout(this._showForTimeout);
		return this;
	}
}

export default class Tooltip extends HTMLElement
{
	#showable = new Showable(this);

	positionAt(x, y)
	{
		this.style.left = `${x}px`;
		this.style.top = `${y}px`;
		return this;
	}

	positionOnTopOf(target, offsetY = 3) // TODO: setPivot/setAnchor method instead
	{
		const bounds = target.getBoundingClientRect();
		return this.positionAt(bounds.left + bounds.width / 2, bounds.top - offsetY);
	}

	show()
	{
		return this.#showable;
	}

	hide()
	{
		this.#showable.clear();
	}
}

customElements.define("x-tooltip", Tooltip);