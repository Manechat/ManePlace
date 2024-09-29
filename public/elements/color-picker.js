import { unpackRGB } from "../scripts/util.calc.js";



function getAt(array, index)
{
	if (index < 0) return array[array.length + index]; // TODO: This will break at large values
	else if (index >= array.length) return array[index - array.length]; // same
	return array[index];
}

export default class ColorPicker extends HTMLElement
{
	#colorButtonContainer = null;
	#confirmButton = null;
	#cancelButton = null;

	#selectedColor = null;

	constructor()
	{
		super();
		this.shadow = this.attachShadow({ mode: "closed" });
		this.#render();
	}

	setColors(colors)
	{
		this.#selectedColor = null;

		this.#colorButtonContainer.textContent = "";

		for (let i = 0; i < colors.length; ++i)
		{
			const color = colors[i];

			const colorButton = document.createElement("div");
	
			colorButton.className = "color";
			colorButton.dataset.index = i;
			colorButton.dataset.color = color;
			colorButton.style.backgroundColor = `rgb(${unpackRGB(color).join(",")})`;
			colorButton.addEventListener("click", () => this.#pick(colorButton));
	
			this.#colorButtonContainer.appendChild(colorButton);
		}
	}

	getSelectedColor()
	{
		return +this.#selectedColor?.dataset.color;
	}

	moveSelection(delta)
	{
		const currentIndex = this.#selectedColor?.dataset.index;

		let nextIndex = delta > 0 ? delta - 1 : delta; // I don't know how to make this better...
		if (currentIndex != null) nextIndex = +currentIndex + delta;

		const nextColorButton = getAt(this.#colorButtonContainer.children, nextIndex);
		if (nextColorButton) this.#pick(nextColorButton);
	}

	#pick(button)
	{
		const alreadySelected = this.#selectedColor === button;

		if (this.#selectedColor)
		{
			this.#selectedColor.classList.remove("picked");
			this.#selectedColor = null;
		}

		if (!alreadySelected)
		{
			this.#selectedColor = button;
			this.#selectedColor.classList.add("picked");
		}

		this.dispatchEvent(new CustomEvent("pick", { detail: +this.#selectedColor?.dataset.color }));
	}

	#confirm()
	{
		this.dispatchEvent(new CustomEvent("confirm", { detail: +this.#selectedColor?.dataset.color }));
	}

	#cancel()
	{
		this.dispatchEvent(new Event("cancel"));
	}

	isActive()
	{
		return !this.#confirmButton.classList.contains("inactive");
	}

	setActive(active)
	{
		this.#confirmButton.classList.toggle("inactive", !active);
	}

	#render()
	{
		this.shadow.innerHTML = `
		<link rel="stylesheet" href="reset.css">
		<link rel="stylesheet" href="global.css">

		<div id="root">
			<div class="center container">
				<div id="colors">
					<div class="color" data-color="ff0000" style="background-color: #ff0000"></div>
				</div>
			</div>
			<div class="center container">
				<div id="cancel" class="gray button">
					<img src="./assets/images/x.svg" height="18px">
				</div>
				<div id="confirm" class="inactive orange button">
					<img src="./assets/images/checkmark.svg" height="18px">
				</div>
			</div>
		</div>
  
		<style>
		#root
		{
			padding: 10px;
			
			border-top: 3px solid #111111;

			background-color: white;

			display: flex;
			justify-content: center;
			flex-direction: column;
		}

		.container
		{
			padding: 10px;
		}

		#colors
		{
			width: min(700px, 100%);
			height: 100%;

			display: flex;
			justify-content: center;
			align-content: center;
			align-items: center;
			flex-wrap: wrap;
			gap: 2px;
		}

		.color
		{
			width: min(8%, 44px);

			aspect-ratio: 1 / 1;

			border: 1px solid #E5E5E5;
		}

		.color.picked
		{
			transform: scale(1.3);

			border: 2px solid #111111;

			box-shadow: 7px 7px #111111E0;
		}

		#cancel, #confirm
		{
			width: min(35%, 270px);
			height: 55px;

			margin: 0 15px 0 15px;
		}

		#confirm
		{
			transition: background-color 0.3s ease;
		}
		</style>`;

		this.#colorButtonContainer = this.shadow.querySelector("#colors");
		this.#confirmButton = this.shadow.querySelector("#confirm");
		this.#cancelButton = this.shadow.querySelector("#cancel");

		this.#confirmButton.addEventListener("click", this.#confirm.bind(this));
		this.#cancelButton.addEventListener("click", this.#cancel.bind(this));
	}
}

customElements.define("color-picker", ColorPicker);