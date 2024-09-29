import { UserStatus } from "./main.constants.js";
import { formatMinutesAndSeconds } from "./util.js";



// TODO: Cache elements somehow?
// TODO: Predefine events?

export function PickerColorsComponent()
{
	const element = document.getElementById("picker");

	return state => // colors
	{
		element.setColors(state.colors);
	};
}

export function PickerConfirmComponent()
{
	const element = document.getElementById("picker");

	return state => // userStatus, currentCooldown
	{
		element.setActive(state.userStatus >= UserStatus.LOGGED_IN && state.currentCooldown <= 0);
	};
}

export function PlaceColorComponent()
{
	const element = document.getElementById("place");

	return state => // userStatus, cooldown, currentCooldown, currentMaxCooldown // TODO: Make this logic less ugly
	{
		if (state.cooldown < 0)
		{
			element.classList.add("inactive");
			element.style.background = null;
			return;
		}

		element.classList.toggle("inactive", state.userStatus < UserStatus.LOGGED_IN);

		if (state.currentCooldown > 0)
		{
			const progress = state.currentCooldown / state.currentMaxCooldown * 100;
			element.style.background = `linear-gradient(to right, #566F74, #566F74 ${progress}%, #2C3C41  ${progress}%, #2C3C41)`;
		}
		else element.style.background = null;
	};
}

export function PlaceTextComponent()
{
	const element = document.querySelector("#place > :nth-child(1)");

	return state => // userStatus, cooldown, currentCooldown
	{
		if (state.cooldown < 0) element.textContent = "ManePlace is closed";
		else if (state.userStatus === UserStatus.LOGGED_OUT) element.textContent = "Log in to place!";
		else if (state.userStatus === UserStatus.NOT_IN_SERVER) element.textContent = `Join ${state.guildName} to place!`;
		else if (state.userStatus === UserStatus.BANNED) element.textContent = "Restricted";
		else if (state.userStatus >= UserStatus.LOGGED_IN)
		{
			if (state.currentCooldown <= 0) element.textContent = "Place!";
			else element.textContent = `Place in ${formatMinutesAndSeconds(state.currentCooldown / 1000)}`;
		}
	};
}

export function PlaceCoordinatesComponent()
{
	const element = document.querySelector("#place > :nth-child(2)");

	return state => // cameraX, cameraY, cameraZoom
	{
		const zoom = state.cameraZoom < 1 ? state.cameraZoom.toFixed(2) : Math.round(state.cameraZoom);
		element.textContent = `(${ Math.floor(state.cameraX) }, ${ Math.floor(state.cameraY) }) ${ zoom }X`;
	};
}

export function LogoutComponent()
{
	const element = document.getElementById("logout");

	return state => // userStatus
	{
		element.classList.toggle("hidden", state.userStatus === UserStatus.LOGGED_OUT);
	};
}

export function PlaceOnClickToggleComponent()
{
	const element = document.getElementById("toggle-place-on-click").children[1];

	return state => // placeOnClickEnabled
	{
		element.textContent = state.placeOnClickEnabled ? "ON" : "OFF";
	};
}

export function ModerateComponent()
{
	const element = document.getElementById("moderate");

	return state => // userStatus
	{
		element.classList.toggle("hidden", state.userStatus !== UserStatus.ADMIN);
	};
}

export function RefreshTimerComponent(sound)
{
	let timer = null;

	return state => // nextPlaceTimestamp
	{
		const delta = state.nextPlaceTimestamp - Date.now();

		if (delta > 0)
		{
			clearTimeout(timer);
			timer = setTimeout(() => sound.play(), delta);
		}
	};
}