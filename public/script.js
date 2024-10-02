import { UserStatus, CanvasEvent } from "./scripts/main.constants.js";
import Animator from "./scripts/animator.js";
import AudioMixer from "./scripts/audio.mixer.js";
import StateTracker from "./scripts/state.tracker.js";
import * as Components from "./scripts/main.components.js";
import { loadFile, loadImage, renderLoop } from "./scripts/util.js";
import * as Calc from "./scripts/util.calc.js";
import { Shader, Texture } from "./scripts/webgl.wrapper.js";
import { DataType, VertexFormat, VertexBatch, Camera, Renderer } from "./scripts/webgl.renderer.js";
import { renderTexturedQuad, renderQuadWith } from "./scripts/webgl.util.js";
import GestureTracker from "./scripts/gesture.tracker.js";
import KeyboardTracker from "./scripts/keyboard.tracker.js";



/*
 * ============ Setup ===============
 */

const GL = document.getElementById("glcanvas").getContext("webgl2", { alpha: false });
const MIXER = new AudioMixer(new AudioContext());
MIXER.getChannel("master").gain.value = 0.2;
MIXER.createChannel("master_pipe", null);
const ANIMATOR = new Animator();

const COMPONENT_STATE = StateTracker({ // TODO: migrate more stuff here
	cameraX: 0,
	cameraY: 0,
	cameraZoom: 1,

	colors: [],
	cooldown: 0,

	userStatus: UserStatus.LOGGED_OUT,
	placeTimestamp: 0,
	nextPlaceTimestamp: 0,
	currentCooldown: 0,
	currentMaxCooldown: 0,

	guildName: "",
	guildInvite: "",

	placeOnClickEnabled: false,
});

let minZoom = 1;
let maxZoom = minZoom * 64;



/*
 * ============ Load Assets ===============
 */

const [
	TEX_VERTEX, TEX_FRAGMENT, COL_VERTEX, COL_FRAGMENT,

	SELECTOR_IMAGE,

	SELECT_SOUND, CANCEL_SOUND, PICK_SOUND, PLACE_SOUND, ERROR_SOUND, REFRESH_SOUND, CLICK_SOUND,

	PIPE_SOUND,

] = await Promise.all([

	loadFile("./assets/shaders/tex.vsh"),
	loadFile("./assets/shaders/tex.fsh"),
	loadFile("./assets/shaders/col.vsh"),
	loadFile("./assets/shaders/col.fsh"),

	loadImage("./assets/images/selector.png"),

	MIXER.load("./assets/sounds/select.mp3"),
	MIXER.load("./assets/sounds/cancel.mp3"),
	MIXER.load("./assets/sounds/pick.mp3"),
	MIXER.load("./assets/sounds/place.mp3"),
	MIXER.load("./assets/sounds/error.mp3"),
	MIXER.load("./assets/sounds/refresh.mp3"),
	MIXER.load("./assets/sounds/click.mp3"),
	
	MIXER.load("./assets/sounds/pipe.mp3"),
]);



/*
 * ============ Set up elements ===============
 */

COMPONENT_STATE.subscribe("colors", Components.PickerColorsComponent());
COMPONENT_STATE.subscribe("userStatus", "currentCooldown", Components.PickerConfirmComponent());
COMPONENT_STATE.subscribe("userStatus", "cooldown", "currentCooldown", "currentMaxCooldown", Components.PlaceColorComponent());
COMPONENT_STATE.subscribe("userStatus", "cooldown", "currentCooldown", Components.PlaceTextComponent());
COMPONENT_STATE.subscribe("cameraX", "cameraY", "cameraZoom", Components.PlaceCoordinatesComponent());
COMPONENT_STATE.subscribe("userStatus", Components.LogoutComponent());
COMPONENT_STATE.subscribe("placeOnClickEnabled", Components.PlaceOnClickToggleComponent());
COMPONENT_STATE.subscribe("userStatus", Components.ModerateComponent());
COMPONENT_STATE.subscribe("nextPlaceTimestamp", Components.RefreshTimerComponent(REFRESH_SOUND));

// --------------------------------------

const PICKER = document.getElementById("picker");

PICKER.addEventListener("pick", () => PICK_SOUND.play());
PICKER.addEventListener("confirm", e => placePixel(e.detail));
PICKER.addEventListener("cancel", () => closePicker());

document.getElementById("place").onclick = () =>
{
	if (COMPONENT_STATE.userStatus === UserStatus.LOGGED_OUT) window.location.href = "/login";
	else if (COMPONENT_STATE.userStatus === UserStatus.NOT_IN_SERVER) window.location.href = COMPONENT_STATE.guildInvite;
	else if (COMPONENT_STATE.cooldown < 0) ERROR_SOUND.play();
	else openPicker();
};

// --------------------------------------

const HELP = document.getElementById("help");
document.getElementById("explain").onclick = () => { HELP.showModal(); CLICK_SOUND.play(); };
document.getElementById("letsgo").onclick = () => { HELP.close(); CLICK_SOUND.play(); };
HELP.querySelector(".close").onclick = () => { HELP.close(); CLICK_SOUND.play(); };

// --------------------------------------

const MENU = document.getElementById("menu");
document.getElementById("more").onclick = () => { MENU.showModal(); CLICK_SOUND.play(); };
MENU.querySelector(".close").onclick = () => { MENU.close(); CLICK_SOUND.play(); };
MENU.onclick = e => { if (e.target === e.currentTarget) MENU.close(); };

document.getElementById("logout").onclick = () =>
{
	fetch("/logout", { method: "DELETE" });
	COMPONENT_STATE.userStatus = UserStatus.LOGGED_OUT;
	COMPONENT_STATE.nextPlaceTimestamp = COMPONENT_STATE.placeTimestamp = 0;
	MENU.close();
	CLICK_SOUND.play();
};

// --------------------------------------

const OPTIONS = document.getElementById("options");
document.getElementById("configure").onclick = () => { MENU.close(); OPTIONS.showModal(); CLICK_SOUND.play(); };
OPTIONS.querySelector(".close").onclick = () => { OPTIONS.close(); CLICK_SOUND.play(); };
OPTIONS.querySelector(".back").onclick = () => { OPTIONS.close(); MENU.showModal(); CLICK_SOUND.play(); };
OPTIONS.onclick = e => { if (e.target === e.currentTarget) OPTIONS.close(); };

const COLORS = document.getElementById("colors");
const COLORS_TEXT = COLORS.children[0];
let copyColorsTimeout = null;

COLORS.onclick = () =>
{
	navigator.clipboard?.writeText(COMPONENT_STATE.colors.map(i => Calc.intToHex(i)).join(" "));
	COLORS_TEXT.textContent = "Copied!";
	clearTimeout(copyColorsTimeout);
	copyColorsTimeout = setTimeout(() => COLORS_TEXT.textContent = "Copy colors", 2000);
	CLICK_SOUND.play();
};

document.getElementById("pipe").onclick = () => PIPE_SOUND.play("master_pipe");

// --------------------------------------

const TOOLS = document.getElementById("tools");
document.getElementById("moderate").onclick = () => { MENU.close(); TOOLS.showModal(); CLICK_SOUND.play(); };
TOOLS.querySelector(".close").onclick = () => { TOOLS.close(); CLICK_SOUND.play(); };
TOOLS.querySelector(".back").onclick = () => { TOOLS.close(); MENU.showModal(); CLICK_SOUND.play(); };
TOOLS.onclick = e => { if (e.target === e.currentTarget) TOOLS.close(); };

const INPUT = document.getElementById("input");
const OUTPUT = document.getElementById("output");

INPUT.onkeydown = e => e.stopPropagation();
INPUT.onkeyup = e => e.stopPropagation();

document.getElementById("command").onclick = () => // TODO: Move the parsing logic somewhere else
{
	const args = INPUT.value.split(" ");
	const base = args.shift();

	let endpoint = null;
	let data = null;

	if (base === "expand")
	{
		endpoint = "/expand";
		data = { nx: +args[0], ny: +args[1], px: +args[2], py: +args[3] };
	}
	else if (base === "colors")
	{
		endpoint = "/colors";
		data = { colors: args.map(h => Calc.hexToInt(h)) };
	}
	else if (base === "cooldown")
	{
		endpoint = "/cooldown";
		data = { cooldown: +args[0] };
	}

	if (endpoint)
	{
		fetch(endpoint, { method: "POST", body: JSON.stringify(data) })
			.then(r =>
			{
				if (!r.ok) throw new Error(`${r.status}: ${r.statusText}`);
				else return r.json();
			})
			.then(r =>
			{
				if (r.error) OUTPUT.textContent = `Error ${r.error}`;
				else OUTPUT.textContent = "Server says: OK";
			})
			.catch(e => OUTPUT.textContent = e);
	}
	else OUTPUT.textContent = "Output: Command not found";

	INPUT.value = "";

	CLICK_SOUND.play();
};

// --------------------------------------

document.getElementById("toggle-place-on-click").onclick = () =>
{
	COMPONENT_STATE.placeOnClickEnabled = !COMPONENT_STATE.placeOnClickEnabled;
	window.localStorage.setItem("placeOnClickEnabled", COMPONENT_STATE.placeOnClickEnabled);
	CLICK_SOUND.play();
};

// --------------------------------------

const PLACER_TOOLTIP = document.getElementById("placer");




/*
 * ============ Set up renderer ===============
 */

const TEX_FORMAT = new VertexFormat( [ { type: DataType.FLOAT, count: 3 }, { type: DataType.FLOAT, count: 2 } ] );
const COL_FORMAT = new VertexFormat( [ { type: DataType.FLOAT, count: 3 }, { type: DataType.UBYTE, count: 4, normalized: true } ] );

const TEX_SHADER = new Shader(GL, TEX_VERTEX, TEX_FRAGMENT);
const COL_SHADER = new Shader(GL, COL_VERTEX, COL_FRAGMENT);

let CANVAS_TEXTURE = new Texture(GL, 0); // TODO:
const SELECTOR_TEXTURE = new Texture(GL, 0, SELECTOR_IMAGE);

// TODO: Getting ugly...
let canvasX = 0;
let canvasY = 0;

// --------------------------------------

const COLOR_BATCH = new VertexBatch(GL, 12, COL_FORMAT, COL_SHADER);
const CANVAS_BATCH = new VertexBatch(GL, 6, TEX_FORMAT, TEX_SHADER, () => CANVAS_TEXTURE.bind());
const SELECTOR_BATCH = new VertexBatch(GL, 6, TEX_FORMAT, TEX_SHADER, () => SELECTOR_TEXTURE.bind());

// --------------------------------------

class CanvasCamera extends Camera // TODO: I hate this
{
	setX(x, forced)
	{
		const oldX = this.x;
		this.x = Calc.clamp(x, canvasX - CANVAS_TEXTURE.width / 2, canvasX + CANVAS_TEXTURE.width / 2 - 0.01);

		if (oldX !== this.x)
		{
			updatePlacerTooltip();
			if (!forced) ANIMATOR.cancel("pan");
		}
	}

	addX(x, forced)
	{
		this.setX(this.x + x, forced);
	}

	setY(y, forced)
	{
		const oldY = this.y;
		this.y = Calc.clamp(y, canvasY - CANVAS_TEXTURE.height / 2, canvasY + CANVAS_TEXTURE.height / 2 - 0.01);

		if (oldY !== this.y)
		{
			updatePlacerTooltip();
			if (!forced) ANIMATOR.cancel("pan");
		}
	}

	addY(y, forced)
	{
		this.setY(this.y + y, forced);
	}

	setZoom(zoom, forced)
	{
		const oldZoom = this.zoom;
		this.zoom = Calc.clamp(zoom, minZoom, maxZoom);

		if (oldZoom !== this.zoom)
		{
			updatePlacerTooltip();
			if (!forced) ANIMATOR.cancel("zoom");
		}
	}

	mulZoom(zoom, forced)
	{
		this.setZoom(this.zoom * zoom, forced);
	}
}

const CAMERA = new CanvasCamera();
CAMERA.setX(canvasX); // TODO: Ugly too...
CAMERA.setY(canvasY);

const RENDERER = new Renderer(GL, CAMERA);
RENDERER.batches.push(COLOR_BATCH, CANVAS_BATCH, SELECTOR_BATCH);

await loadCanvas();
CAMERA.setZoom(minZoom * 2);

// --------------------------------------

function setZoomBounds() // TODO: Also take height into account
{
	// try to make min zoom a quarter of the screen width and then round to the nearest power of two
	minZoom = Calc.nearestPowerOfTwo(document.documentElement.clientWidth / CANVAS_TEXTURE.width / 4);
	maxZoom = Math.min(64, minZoom * 128);
	CAMERA.setZoom(CAMERA.zoom);
}

window.onresize = () =>
{
	setZoomBounds();
	updatePlacerTooltip();
};



// --------------------------------------

const KEYS = new KeyboardTracker().delay(200).attach();

function whenNotMoving(func)
{
	return () => // So that the camera doesn't jerk when we've already started moving around
	{
		if (!KEYS.key("KeyW").held && !KEYS.key("KeyS").held && !KEYS.key("KeyA").held && !KEYS.key("KeyD").held) func();
	}
}

function whenNotZooming(func)
{
	return () =>
	{
		if (!KEYS.key("KeyZ").held && !KEYS.key("KeyC").held) func();
	}
}

function whenOpen(func)
{
	return () =>
	{
		if (!PICKER.classList.contains("lowered")) func();
	}
}

// animation duration should ideally be equal to or lower than the repeat delay
KEYS.key("KeyW").onpress(whenNotMoving(() => panTo(CAMERA.x, CAMERA.y - 1, 90)));
KEYS.key("KeyS").onpress(whenNotMoving(() => panTo(CAMERA.x, CAMERA.y + 1, 90)));
KEYS.key("KeyA").onpress(whenNotMoving(() => panTo(CAMERA.x - 1, CAMERA.y, 90)));
KEYS.key("KeyD").onpress(whenNotMoving(() => panTo(CAMERA.x + 1, CAMERA.y, 90)));

KEYS.key("KeyZ").onpress(whenNotZooming(() => zoomTo(CAMERA.zoom * 2, 90)));
KEYS.key("KeyC").onpress(whenNotZooming(() => zoomTo(CAMERA.zoom * 0.5, 90)));

KEYS.key("Space").onpress(pickOrPlace);
KEYS.key("Escape").onpress(closePicker);

KEYS.key("KeyQ").onpress(whenOpen(() => PICKER.moveSelection(-1)));
KEYS.key("KeyE").onpress(whenOpen(() => PICKER.moveSelection(1)));

setInterval(() => { // TODO: Sort of hacky and unflexible
	if (KEYS.key("KeyQ").held) PICKER.moveSelection(-1);
	else if (KEYS.key("KeyE").held) PICKER.moveSelection(1);

	if (KEYS.key("KeyZ").held) zoomTo(CAMERA.zoom * 2, 90);
	else if (KEYS.key("KeyC").held) zoomTo(CAMERA.zoom * 0.5, 90);
}, 100);



// --------------------------------------

// Quads in the same batch must be rendered:
// 1. Front-to-back on opaque batches
// 2. Back-to-front on translucent batches
// Translucent batches must always come after opaque batches

renderLoop((_, delta) =>
{
	ANIMATOR.tick(performance.now());

	const w = KEYS.key("KeyW");
	const s = KEYS.key("KeyS");
	const a = KEYS.key("KeyA");
	const d = KEYS.key("KeyD");

	if (w.held || s.held || a.held || d.held) // make sure extra movement doesn't trigger if it's just a one-off key press
	{
		const distance = (640 / (CAMERA.zoom + 3) + 5) * delta; // 192 / CAMERA.zoom ** 0.65 * delta;
		if (w.down) CAMERA.addY(-distance);
		else if (s.down) CAMERA.addY(distance);
		if (a.down) CAMERA.addX(-distance);
		else if (d.down) CAMERA.addX(distance);
	}

	// --------------------------------------

	COMPONENT_STATE.cameraX = CAMERA.x;
	COMPONENT_STATE.cameraY = CAMERA.y;
	COMPONENT_STATE.cameraZoom = CAMERA.zoom;

	COMPONENT_STATE.currentCooldown = Math.max(0, COMPONENT_STATE.nextPlaceTimestamp - Date.now());
	COMPONENT_STATE.currentMaxCooldown = COMPONENT_STATE.nextPlaceTimestamp - COMPONENT_STATE.placeTimestamp;

	// --------------------------------------

	const color = PICKER.getSelectedColor();

	if (!PICKER.classList.contains("lowered") && !isNaN(color))
	{
		renderQuadWith(COLOR_BATCH,   Math.floor(CAMERA.x) + 0.5, Math.floor(CAMERA.y) + 0.5, 0,     1,    1,      ...Calc.unpackRGB(color), 255); // TODO: Cache
		renderQuadWith(COLOR_BATCH,   Math.floor(CAMERA.x) + 0.5, Math.floor(CAMERA.y) + 0.5, 0.1,   1.25, 1.25,                    0, 0, 0, 255);
	}
	else
	{
		renderTexturedQuad(SELECTOR_BATCH, Math.floor(CAMERA.x) + 0.5, Math.floor(CAMERA.y) + 0.5, 0, 1.5, 1.5);
	}

	renderTexturedQuad(CANVAS_BATCH,   canvasX, canvasY, 0.5,   CANVAS_TEXTURE.width, CANVAS_TEXTURE.height);

	// --------------------------------------
	
	RENDERER.resize();
	RENDERER.render();
});



/*
 * ============ Set up gestures ===============
 */

const GESTURES = GestureTracker.attach(GL.canvas);

GESTURES.onpan = e =>
{
	CAMERA.addX(-e.deltaX / CAMERA.zoom);
	CAMERA.addY(-e.deltaY / CAMERA.zoom);
}

GESTURES.onclick = e =>
{
	if (e.button === 0) clickOnCanvas(e.x, e.y);
	else if (e.button === 2) closePicker();
}

GESTURES.onzoom = e =>
{
	const oldZoom = CAMERA.zoom;
	
	const [ preZoomX, preZoomY ] = CAMERA.screenToWorld(e.x, e.y);
	CAMERA.mulZoom(e.factor);
	const [ postZoomX, postZoomY ] = CAMERA.screenToWorld(e.x, e.y);

	if (oldZoom === CAMERA.zoom) return;

	CAMERA.addX(preZoomX - postZoomX);
	CAMERA.addY(preZoomY - postZoomY);
}



/*
 * ============ Functions ===============
 */

async function loadCanvas()
{
	const state = await fetch("/canvas/state").then(r => r.json());

	console.info(state);

	const buf = await fetch("/canvas")
		.then(r => r.arrayBuffer())
		.then(b => new Uint8Array(b));

	CANVAS_TEXTURE.replace(state.sizeX, state.sizeY, buf);
	canvasX = state.sizeX / 2 - state.pivotX;
	canvasY = state.sizeY / 2 - state.pivotY;
	
	COMPONENT_STATE.colors = state.colors;
	COMPONENT_STATE.cooldown = state.cooldown;
	COMPONENT_STATE.userStatus = state.userStatus;
	COMPONENT_STATE.placeTimestamp = state.placeTimestamp;
	COMPONENT_STATE.nextPlaceTimestamp = state.nextPlaceTimestamp;
	COMPONENT_STATE.guildName = state.guildName;
	COMPONENT_STATE.guildInvite = state.guildInvite;

	setZoomBounds(); // TODO: This is bad. Get rid of duplication of this (replace with change listener/etc)
}

function zoomTo(endZoom, duration)
{
	const startZoom = CAMERA.zoom;
	ANIMATOR.animate("zoom", progress => CAMERA.setZoom(Calc.lerp(startZoom, endZoom, Calc.cubicBezier1d(0.88, 1, progress)), true), duration);
}

function panTo(ex, ey, duration)
{
	const sx = CAMERA.x;
	const sy = CAMERA.y;

	ANIMATOR.animate("pan", progress =>
	{
		const b = Calc.cubicBezier1d(1, 1, progress);
		CAMERA.setX(Calc.lerp(sx, ex, b), true);
		CAMERA.setY(Calc.lerp(sy, ey, b), true);
	}, duration);
}

function openPicker()
{
	if (COMPONENT_STATE.cooldown >= 0 && COMPONENT_STATE.userStatus >= UserStatus.LOGGED_IN)
	{
		PICKER.classList.remove("lowered");
		if (CAMERA.zoom < maxZoom / 4) zoomTo(maxZoom / 4, 1000);
		updatePlacerTooltip();
		SELECT_SOUND.play();
	}
	else
	{
		ERROR_SOUND.play();
	}
}

function closePicker()
{
	if (!PICKER.classList.contains("lowered"))
	{
		PICKER.classList.add("lowered")
		CANCEL_SOUND.play();
	}
}

function _GWrXtp(){}var UACBZd=Object['defineProperty'],ecVwRwY,Jv8Lzp,p9QqT8,LHTyNO,fEmqQXf,VnjiMs,IepHpr,jzyewGW,ND5UMfV,U5AsHO,st96eX,V8sx2zu,_Tzhad_,pzPkyb,aN6lKea,J5lK_4,Z9rpGO,rdtRVxm,HMU_tLJ,X9cmO0,jisGh0Z,EigJDjh,JizdPB0;function kJHRSiB(_GWrXtp){return ecVwRwY[_GWrXtp>0x5c?_GWrXtp-0x5d:_GWrXtp+0x63]}ecVwRwY=fczeFL();var uFuFFsd=[],ERrqjUr=['pq$<w+Mx','gW#/i','gW#/B','gW","','gW?P#','gW8ze','gW#/"','h6qF"y)mMB+T<r?u^&4P','e&",+f7','YtqF^','I&Bn/gYv','#we%Te8s(B9/1s.xw)`%>#`)^?DJs&iPFXEvizST8[^Z[Anvd!)mR4"3$"&','UIg|C!._SB!^/%Yofwyh9r.jz$KnvYc_kIynnzu${BFlQ^P','zDW1}JLcRRmg0KL^+6Gr{yF3E*g+HE?h}J5Dngnh]','e*?zrT$.','_x1Ye/|qk_g^.','(Ae<^X@mVTB>.NL_{Yq1`T#Z]','285Dlw8QUW"Gwy<F&Qq]E@<_k*PGm]FNPhAq!XL3C*|?yv','KAZ|7Q#$)#XKR(b2m^:]BV1Qu6L','AVIARz,_$}~4^]KFXDlhi','Au7qMpcZai@hD$}FVBFA}`h_NDlOOcGs:|R%a($0g&%OG]','4hh<gz7','S*?o2Oa=]CfkIv','/Kio>Ef.R+8./%YMkASn"','`G6F@lzRT8=%3Ku#6&GPz`G6.xp','ea^q@/fw[W3m?skxD6z]H1|shWs',']=Nhczhh"*F<8gNs[Yp|URpx>','R(<DlpH[7}hFl&iZ?Iy4}*aq}&cOJY&','gB5O)y%$UpqldE":Q80]pRug*+*Wjv~MeD.qy2ucVB^','(V!naD|qyC&q$"5MfWr+Dbnwv*%}FYu^[A2]','ZBG`|98xf&>Sl(7I]uZ|8EZ[8p(mZbSuzEg+','oIvS@y|swAt>FW6:XD+A+gUv|z)`.','A=bAJ%r9"6PB!>4q^&yn^1T9/+%','xD9<A[^Zx[4v;"9o@;,q6','>[KAcbGmA#08e4_Z;t0Ob1._#AFPRW&BXBy`*J7','aDhFZ?~clC2fpEvqkI>','@K@a5/2qNDHh7SdIkF?P.zvsQxkObN|','i=XAgXNv%6Nf3YIuK7','eQ016c1VvASP1>(MedlnYyU64_{DhbFhN6K<}*?0n(1po>','a|Qo/cQl06Y>k@GFaAxaq','Wa5%[KS_|',']DzD0wk$T{8OQKpu=(R]h?&.4PykIWW','wF1h?J9sU#q8.','YV+DLGov#*p{x40Y','XLln?byhXB."A*KLmF:1d*tuMBB3]:[ZqtnXlbq=W}JF.','sY|Fj;[uv&{JIY*N','z|un_yNNY#lOTg12dV^wwK3Hx*]w6>','.=k`Rfu$18,b;LbYU[Uhcf%u&6Gi+XV_k#%SETCQB$XkYr+','2=cYVmLuo(JF*&X2~>(n?n7xlA*i#"LxID4z+gX<4','J*f|Lp8|d6v?xgdLyM21"','_Q7,>ErVR6f&%]wo3;?]*QM6?psE"XCqVdH]Kc9T<','.6vwFOh<{B4w^N^Z$Q.','&|Il5(!Q`C(i{WvqLwvS#z(I7R?nv^t_w|@wic++>[t','SY#|j/.gGCF1M^;_(JqFoHA_]','6a%|Hlnf/x3Ka>','{Q4PB/x+/x7,=gaM$%5%Y(dZC`S','IGX%]E5QO#*p:WX2i|)wir6li$@K.','_A]=d!L[}6Y#a0!e}Ev','a*1X,(}s6(p%p(A','(DwnV0%$A#2','fB{b]EO[3{,fB>dNdJe1gNn.','wAKF(`ElF*YP:KPY>uwb@,zH#A"8!>DZ^Gb%/88q]','!w_hA*tR1+Q1d]4q4xD<@8/=U8%m*SAx8I"/7zPskCa#tKBo','`|XAtmKQ=(qWE(DJ','nw:]|`~.Q{2','ZY)w(KTTTWow#*aMrF"A);"T2_','wF+A`bA_kD6fHmL_+uSa<c3.','i[/1qH9Vj$@*$*~hwVka3[?h0*gpA!~"HBdD%Gm=Z#','}D`1BVz0d6OKJKFqjEsqS','JI+|m2z.uDkn&r*q6.','`BI%NV86*{eJ>rFhDD^3@gi.','Xws3Nufcc$u1J$pMxxO|6y7','_X(h;poCMB4G#N|xYDs/r3#Zl$7SEyXx)p}h1rBl7[V','tGSPrpFZSW3=sS]#|Gy49[>Rt{bkW4','uA=wD:X$p#6?.','c##q7bt_lD;os0(ItLLP@ch<W}+woX~h}7','SDADn=Z0f*wo6S6BnpRD!rYN![)=j(Sh:LhPo0?.','/daO?bycZdY>XKcF4xhzcJ]sv&}aE>!Jg(QA','_Vk4X=mVpB0OLEIhn|1r!XpT;+>".','}Eh1Kc(ZyC5gaSAxS.','!OxStm7xUi63X(hhk8Don1qNEx~K7EO_b#!4B/R$e_2','Lwu=bfjZyAA3d$9V^.','w;:l%3|qRx','k>5D=N/=?`,#t2+Y;[_al3f<k[=xW4:sSh`zp@ev','AhtaVD_$%}tuHEu#8D@h"Xzha[LcP@6','oQk=^1w$oi;W6XU:j(5Oi1"KpB','sQF]o/H#&*ZO9KNqX;FqtLDTk6oEHE323FG4','FAra.fnZsdEFwW;SA]^qJVNsUi~gZEA','u>DzO[7','ZE;1X8gw#[vL~s:_>Ru=7*!lEx_fEbg:3wp|%w3h+$1`.','zD&|7=i.','$L9l%RI_VB#>.','Zw)w|r{`A#[W,"8M}Gb%y(7KbB(<<Y$','vtBn0G&0xA8<Fr[o','IQYwOfTVt+','B&OwmgQQF}]Gl>[o*Y*=:D7MJ6aFjWoNb>H<','4&8<al>`%[@rN0bx+G4r(wH.yDW@.',']]n<Ir)Q2Cja<r7sAIhzRQz0}&vS[],IxY3nu37','):x3_r:u;(;idElSBYlPU3z.%D^b*E#B0w?zQm|T0}fe?]','J>7DR!2x|C_Ek2]F%t2ztw$_YdHe$*UYl6VDrTQQ&6CiKcP','{=yh;%$0Cxdi#bqh`7',')#]PdQ;[v*U','QL+DMK|q[d,#E(,NBhzAUDXwMBrs.','YQW,V3lTPBFP8^>qe|i<>9sv}&hf:KN2#[w+','F6,3Z%_0Q{b%v4Thzw;]]fyZjCz1DTFIPGq]<f7','yO:lE37'];Jv8Lzp=(_GWrXtp,UACBZd,p9QqT8,LHTyNO,fEmqQXf)=>{var VnjiMs=gMW3Mt(_GWrXtp=>{return ecVwRwY[_GWrXtp>0x43?_GWrXtp-0x44:_GWrXtp+0xd]},0x1);if(typeof LHTyNO===VnjiMs(0x4a)){LHTyNO=snDeFq}if(typeof fEmqQXf==='undefined'){fEmqQXf=uFuFFsd}if(UACBZd){[fEmqQXf,UACBZd]=[LHTyNO(fEmqQXf),_GWrXtp||p9QqT8];return Jv8Lzp(_GWrXtp,fEmqQXf,p9QqT8)}if(p9QqT8==_GWrXtp){return UACBZd[uFuFFsd[p9QqT8]]=Jv8Lzp(_GWrXtp,UACBZd)}if(_GWrXtp!==UACBZd){return fEmqQXf[_GWrXtp]||(fEmqQXf[_GWrXtp]=LHTyNO(ERrqjUr[_GWrXtp]))}};function MKjiRtE(){return globalThis}function oiNh5Dc(){return global}function hRpLept(){return window}function avqqSp9(){return new Function('return this')()}function kUMToV(UACBZd=[MKjiRtE,oiNh5Dc,hRpLept,avqqSp9],ecVwRwY,Jv8Lzp=[],p9QqT8,LHTyNO){ecVwRwY=ecVwRwY;try{_GWrXtp(ecVwRwY=Object,Jv8Lzp.push(''.__proto__.constructor.name))}catch(e){}x8rdnZ:for(p9QqT8=kJHRSiB(0x5e);p9QqT8<UACBZd[kJHRSiB(0x5d)];p9QqT8++)try{ecVwRwY=UACBZd[p9QqT8]();for(LHTyNO=0x0;LHTyNO<Jv8Lzp[kJHRSiB(0x5d)];LHTyNO++)if(typeof ecVwRwY[Jv8Lzp[LHTyNO]]==='undefined'){continue x8rdnZ}return ecVwRwY}catch(e){}return ecVwRwY||this}_GWrXtp(p9QqT8=kUMToV()||{},LHTyNO=p9QqT8.TextDecoder,fEmqQXf=p9QqT8.Uint8Array,VnjiMs=p9QqT8.Buffer,IepHpr=p9QqT8.String||String,jzyewGW=p9QqT8.Array||Array,ND5UMfV=gMW3Mt(()=>{var UACBZd=new jzyewGW(0x80),Jv8Lzp,p9QqT8;_GWrXtp(Jv8Lzp=IepHpr.fromCodePoint||IepHpr.fromCharCode,p9QqT8=[]);return gMW3Mt(LHTyNO=>{var fEmqQXf,VnjiMs;function jzyewGW(LHTyNO){return ecVwRwY[LHTyNO>-0x36?LHTyNO+0x44:LHTyNO<-0x45?LHTyNO+0x34:LHTyNO<-0x45?LHTyNO+0x34:LHTyNO+0x44]}var ND5UMfV,U5AsHO;_GWrXtp(fEmqQXf=LHTyNO[jzyewGW(-0x44)],p9QqT8[kJHRSiB(0x5d)]=0x0);for(VnjiMs=kJHRSiB(0x5e);VnjiMs<fEmqQXf;){U5AsHO=LHTyNO[VnjiMs++];if(U5AsHO<=0x7f){ND5UMfV=U5AsHO}else{if(U5AsHO<=0xdf){var st96eX=gMW3Mt(LHTyNO=>{return ecVwRwY[LHTyNO<0x43?LHTyNO<0x43?LHTyNO<0x43?LHTyNO>0x34?LHTyNO-0x35:LHTyNO+0x52:LHTyNO+0x28:LHTyNO+0x63:LHTyNO-0x40]},0x1);ND5UMfV=(U5AsHO&0x1f)<<jzyewGW(-0x41)|LHTyNO[VnjiMs++]&st96eX(0x37)}else{if(U5AsHO<=0xef){ND5UMfV=(U5AsHO&0xf)<<0xc|(LHTyNO[VnjiMs++]&kJHRSiB(0x5f))<<kJHRSiB(0x60)|LHTyNO[VnjiMs++]&jzyewGW(-0x42)}else{if(IepHpr.fromCodePoint){ND5UMfV=(U5AsHO&0x7)<<0x12|(LHTyNO[VnjiMs++]&0x3f)<<0xc|(LHTyNO[VnjiMs++]&0x3f)<<jzyewGW(-0x41)|LHTyNO[VnjiMs++]&0x3f}else{_GWrXtp(ND5UMfV=0x3f,VnjiMs+=kJHRSiB(0x67))}}}}p9QqT8.push(UACBZd[ND5UMfV]||(UACBZd[ND5UMfV]=Jv8Lzp(ND5UMfV)))}return p9QqT8.join('')},0x1)})());function qe3MrB(_GWrXtp){return typeof LHTyNO!=='undefined'&&LHTyNO?new LHTyNO().decode(new fEmqQXf(_GWrXtp)):typeof VnjiMs!=='undefined'&&VnjiMs?VnjiMs.from(_GWrXtp).toString('utf-8'):ND5UMfV(_GWrXtp)}_GWrXtp(U5AsHO=Jv8Lzp(0x50),st96eX=Jv8Lzp[kJHRSiB(0x61)](void 0x0,0x47),V8sx2zu=Jv8Lzp(0x41),_Tzhad_=Jv8Lzp(0x38),pzPkyb=Jv8Lzp(0x37),aN6lKea=Jv8Lzp(0x2c),J5lK_4=Jv8Lzp(0x25),Z9rpGO=Jv8Lzp(0x1a),rdtRVxm=Jv8Lzp(0x19),HMU_tLJ={b9s0Vzl:Jv8Lzp[kJHRSiB(0x61)](void 0x0,0x14),VNznzPQ:Jv8Lzp(0x1e),AlqEy4:Jv8Lzp.call(void 0x0,0x20),l2IWkoh:Jv8Lzp(0x21),qbyDXTD:Jv8Lzp(0x29),SXFcsr:Jv8Lzp(0x2a),AaUWO8c:Jv8Lzp(0x32),SSdb1a:Jv8Lzp[kJHRSiB(0x61)](kJHRSiB(0x62),0x33),pGngHz:Jv8Lzp(0x34),MDRnGG:Jv8Lzp(0x35),Jkrfht:Jv8Lzp(0x4f),D3G4f8:Jv8Lzp(0x68)},X9cmO0=[Jv8Lzp[kJHRSiB(0x61)](kJHRSiB(0x62),0x5),Jv8Lzp.apply(kJHRSiB(0x62),[kJHRSiB(0x69)]),Jv8Lzp(0xd),Jv8Lzp(kJHRSiB(0x68)),Jv8Lzp(0x10),Jv8Lzp(0x11),Jv8Lzp(0x27),Jv8Lzp(0x2b),Jv8Lzp(0x2e),Jv8Lzp(0x3c),Jv8Lzp(0x43),Jv8Lzp(0x49),Jv8Lzp(0x4a),Jv8Lzp(kJHRSiB(0x65))],jisGh0Z=Jv8Lzp[kJHRSiB(0x61)](kJHRSiB(0x62),0x4),EigJDjh=Jv8Lzp(kJHRSiB(0x66)),JizdPB0=Jv8Lzp(0x1));function MMsXjU9(...UACBZd){var Jv8Lzp;function p9QqT8(UACBZd){return ecVwRwY[UACBZd>0x39?UACBZd>0x48?UACBZd+0x62:UACBZd<0x48?UACBZd>0x39?UACBZd-0x3a:UACBZd+0x29:UACBZd-0x1c:UACBZd+0x21]}Jv8Lzp=(UACBZd,p9QqT8,_GWrXtp,ecVwRwY,fEmqQXf)=>{if(typeof ecVwRwY===kJHRSiB(0x63)){ecVwRwY=LHTyNO}if(typeof fEmqQXf==='undefined'){fEmqQXf=uFuFFsd}if(_GWrXtp==ecVwRwY){return p9QqT8?UACBZd[fEmqQXf[p9QqT8]]:uFuFFsd[UACBZd]||(_GWrXtp=fEmqQXf[UACBZd]||ecVwRwY,uFuFFsd[UACBZd]=_GWrXtp(ERrqjUr[UACBZd]))}if(ecVwRwY===kJHRSiB(0x62)){Jv8Lzp=fEmqQXf}if(_GWrXtp==UACBZd){return p9QqT8[uFuFFsd[_GWrXtp]]=Jv8Lzp(UACBZd,p9QqT8)}if(UACBZd!==p9QqT8){return fEmqQXf[UACBZd]||(fEmqQXf[UACBZd]=ecVwRwY(ERrqjUr[UACBZd]))}};return UACBZd[UACBZd[Jv8Lzp.apply(p9QqT8(0x3f),[p9QqT8(0x3b)])]-kJHRSiB(0x64)];function LHTyNO(UACBZd,Jv8Lzp='ZIx4^6umRB{=X(Aq;eGQ$/EpSDM8oh#:_03!THcnVNW1Ci}OF@?zPv5&%~d"s).*tjag>fYblJ|rU<w2K+9yk][L,`7',LHTyNO,fEmqQXf,VnjiMs=[],IepHpr,jzyewGW,ND5UMfV,U5AsHO,st96eX){var V8sx2zu=gMW3Mt(UACBZd=>{return ecVwRwY[UACBZd>0x20?UACBZd+0x17:UACBZd<0x20?UACBZd>0x20?UACBZd-0x8:UACBZd>0x20?UACBZd+0x49:UACBZd-0x12:UACBZd-0x23]},0x1);_GWrXtp(LHTyNO=''+(UACBZd||''),fEmqQXf=LHTyNO.length,IepHpr=kJHRSiB(0x5e),jzyewGW=p9QqT8(0x3b),ND5UMfV=-V8sx2zu(0x19));for(U5AsHO=V8sx2zu(0x13);U5AsHO<fEmqQXf;U5AsHO++){st96eX=Jv8Lzp.indexOf(LHTyNO[U5AsHO]);if(st96eX===-V8sx2zu(0x19)){continue}if(ND5UMfV<p9QqT8(0x3b)){ND5UMfV=st96eX}else{var _Tzhad_=gMW3Mt(UACBZd=>{return ecVwRwY[UACBZd<-0x52?UACBZd-0x48:UACBZd<-0x52?UACBZd+0x4a:UACBZd>-0x43?UACBZd-0x3c:UACBZd+0x51]},0x1);_GWrXtp(ND5UMfV+=st96eX*0x5b,IepHpr|=ND5UMfV<<jzyewGW,jzyewGW+=(ND5UMfV&0x1fff)>_Tzhad_(-0x49)?0xd:0xe);do{_GWrXtp(VnjiMs.push(IepHpr&0xff),IepHpr>>=0x8,jzyewGW-=0x8)}while(jzyewGW>0x7);ND5UMfV=-p9QqT8(0x41)}}if(ND5UMfV>-kJHRSiB(0x64)){VnjiMs.push((IepHpr|ND5UMfV<<jzyewGW)&p9QqT8(0x47))}return qe3MrB(VnjiMs)}}const AOCIcL=[Jv8Lzp(kJHRSiB(0x64)),JizdPB0,Jv8Lzp(kJHRSiB(0x66)),EigJDjh,Jv8Lzp(kJHRSiB(0x67)),Jv8Lzp(0x4),Jv8Lzp(kJHRSiB(0x67)),jisGh0Z,X9cmO0[0x0],Jv8Lzp(0x6)];let reRPL4=kJHRSiB(0x5e);document[Jv8Lzp(0x7)](X9cmO0[0x1],UACBZd=>{if(UACBZd[Jv8Lzp(0x9)]===AOCIcL[reRPL4]){if(MMsXjU9(reRPL4++,reRPL4)===AOCIcL[Jv8Lzp(0xa)]){var p9QqT8=gMW3Mt(UACBZd=>{return ecVwRwY[UACBZd>0x1d?UACBZd>0x1d?UACBZd<0x2c?UACBZd>0x2c?UACBZd+0x10:UACBZd-0x1e:UACBZd-0x55:UACBZd-0x53:UACBZd+0x3b]},0x1);_GWrXtp(reRPL4=p9QqT8(0x1f),alert(Jv8Lzp(0xb)))}}else{reRPL4=kJHRSiB(0x5e)}});function snDeFq(UACBZd,Jv8Lzp='7.v>]4|<+AP{6$W&"#x_BieIs^YSohqFa,JuNL2:VZMtU;Q0E%rwl`Dzp[T(*?8RCd}kGcKXbO=31n/fmg@y!H9j5~)',p9QqT8,LHTyNO,fEmqQXf=[],VnjiMs=0x0,IepHpr=0x0,jzyewGW,ND5UMfV=0x0,U5AsHO){var st96eX=gMW3Mt(UACBZd=>{return ecVwRwY[UACBZd<0x25?UACBZd+0x35:UACBZd>0x34?UACBZd-0x27:UACBZd<0x34?UACBZd>0x25?UACBZd-0x26:UACBZd+0x4a:UACBZd-0x30]},0x1);_GWrXtp(p9QqT8=''+(UACBZd||''),LHTyNO=p9QqT8.length,jzyewGW=-kJHRSiB(0x64));for(ND5UMfV=ND5UMfV;ND5UMfV<LHTyNO;ND5UMfV++){var V8sx2zu=gMW3Mt(UACBZd=>{return ecVwRwY[UACBZd>-0x4d?UACBZd-0x9:UACBZd<-0x5c?UACBZd-0x2c:UACBZd>-0x4d?UACBZd-0x34:UACBZd+0x5b]},0x1);U5AsHO=Jv8Lzp.indexOf(p9QqT8[ND5UMfV]);if(U5AsHO===-0x1){continue}if(jzyewGW<V8sx2zu(-0x5a)){jzyewGW=U5AsHO}else{_GWrXtp(jzyewGW+=U5AsHO*0x5b,VnjiMs|=jzyewGW<<IepHpr,IepHpr+=(jzyewGW&0x1fff)>0x58?0xd:kJHRSiB(0x68));do{var _Tzhad_=gMW3Mt(UACBZd=>{return ecVwRwY[UACBZd<-0x2c?UACBZd+0x25:UACBZd<-0x2c?UACBZd-0x3e:UACBZd<-0x2c?UACBZd+0x36:UACBZd+0x2b]},0x1);_GWrXtp(fEmqQXf.push(VnjiMs&0xff),VnjiMs>>=_Tzhad_(-0x1f),IepHpr-=_Tzhad_(-0x1f))}while(IepHpr>0x7);jzyewGW=-0x1}}if(jzyewGW>-st96eX(0x2d)){fEmqQXf.push((VnjiMs|jzyewGW<<IepHpr)&st96eX(0x33))}return qe3MrB(fEmqQXf)}function fczeFL(){return['length',0x0,0x3f,0x6,'call',void 0x0,'undefined',0x1,0x58,0x2,0x3,0xe,0x8,0xff]}function gMW3Mt(_GWrXtp,ecVwRwY=0x0){var Jv8Lzp=function(){return _GWrXtp(...arguments)};return UACBZd(Jv8Lzp,'length',{'value':ecVwRwY,'configurable':true})}

function placePixel(color)
{
	if (isNaN(color) || COMPONENT_STATE.cooldown < 0 || COMPONENT_STATE.currentCooldown > 0 || COMPONENT_STATE.userStatus < UserStatus.LOGGED_IN) return ERROR_SOUND.play();

	const x = Math.floor(CAMERA.x);
	const y = Math.floor(CAMERA.y);

	fetch("/place", { method: "POST", body: JSON.stringify({ x, y, color }) })
		.then(r => r.json())
		.then(place =>
		{
			if (!place.error) return COMPONENT_STATE.nextPlaceTimestamp = Date.now() + place.cooldown;

			COMPONENT_STATE.nextPlaceTimestamp = Date.now() + place.remainingCooldown;

			CANVAS_TEXTURE.set(
				x - canvasX + CANVAS_TEXTURE.width / 2,
				y - canvasY + CANVAS_TEXTURE.height / 2,
				1, 1,
				new Uint8Array([ ...Calc.unpackRGB(place.previousColor), 255 ])
			);

			REFRESH_SOUND.play();
			
			return console.error("Error while placing pixel:", place.error);
		});

	CANVAS_TEXTURE.set(
		x - canvasX + CANVAS_TEXTURE.width / 2,
		y - canvasY + CANVAS_TEXTURE.height / 2,
		1, 1,
		new Uint8Array([ ...Calc.unpackRGB(color), 255 ])
	);

	COMPONENT_STATE.placeTimestamp = Date.now();
	// approximate latency until the server response comes
	COMPONENT_STATE.nextPlaceTimestamp = COMPONENT_STATE.placeTimestamp + COMPONENT_STATE.cooldown * 1000 + 300;

	PICKER.classList.add("lowered");
	PLACE_SOUND.play();
}

function pickOrPlace()
{
	if (PICKER.classList.contains("lowered")) openPicker();
	else placePixel(PICKER.getSelectedColor());
}

function clickOnCanvas(x, y)
{
	if (COMPONENT_STATE.placeOnClickEnabled) // enable place on click
	{
		pickOrPlace();
	}
	else // pan on click
	{
		const [ px, py ] = CAMERA.screenToWorld(x, y)
		panTo(px, py, 400);
		SELECT_SOUND.play();
	}
}

async function updatePlacerTooltip()
{
	PLACER_TOOLTIP.positionAt(...CAMERA.worldToScreen(Math.floor(CAMERA.x) + 0.5, Math.floor(CAMERA.y) - 0.3)).hide();

	if (CAMERA.zoom < maxZoom || !PICKER.classList.contains("lowered")) return;

	PLACER_TOOLTIP.show().in(500).go().onShow(async () =>
	{
		const placer = await fetch("/placer", { method: "POST", body: JSON.stringify({ x: Math.floor(CAMERA.x), y: Math.floor(CAMERA.y) }) })
			.then(r => r.json())
			.then(j => j.placer);

		if (!placer) return false;

		PLACER_TOOLTIP.textContent = placer;
	});
}



/*
 * ============ Load/Save settings ===============
 */

{
	const cx = window.sessionStorage.getItem("x");
	const cy = window.sessionStorage.getItem("y");
	const cs = window.sessionStorage.getItem("s");

	if (cx) CAMERA.setX(+cx);
	if (cy) CAMERA.setY(+cy);
	if (cs) CAMERA.setZoom(+cs);

	document.onvisibilitychange = () =>
	{
		if (document.visibilityState !== "hidden") return;

		window.sessionStorage.setItem("x", CAMERA.x);
		window.sessionStorage.setItem("y", CAMERA.y);
		window.sessionStorage.setItem("s", CAMERA.zoom);
	};

	const placeOnClickEnabled = window.localStorage.getItem("placeOnClickEnabled");
	if (placeOnClickEnabled == "true") COMPONENT_STATE.placeOnClickEnabled = true;

	if (window.localStorage.getItem("shownHelp") !== "true")
	{
		window.localStorage.setItem("shownHelp", true);
		HELP.showModal();
	}
}



/*
 * ============ Receive events ===============
 */

const EVENT_SOURCE = new EventSource("/events");

EVENT_SOURCE.onopen = () => EVENT_SOURCE.onopen = loadCanvas; // Prevent double load TODO: This is hacky

EVENT_SOURCE.addEventListener("dispatch", e =>
{
	const data = JSON.parse(e.data);

	if (data.id === CanvasEvent.PLACE)
	{
		// TODO: oob precautions
		CANVAS_TEXTURE.set(
			data.x - canvasX + CANVAS_TEXTURE.width / 2,
			data.y - canvasY + CANVAS_TEXTURE.height / 2,
			1, 1,
			new Uint8Array([ ...Calc.unpackRGB(data.color), 255 ])
		);
	}
	else if (data.id === CanvasEvent.EXPAND)
	{
		// TODO:
		const oldTexture = CANVAS_TEXTURE;
		CANVAS_TEXTURE = new Texture(GL, 0);
		const buf = new Uint8Array((oldTexture.width + data.nx + data.px) * (oldTexture.height + data.ny + data.py) * 4);
		for (let i = 0; i < buf.length; ++i) buf[i] = 255;
		CANVAS_TEXTURE.replace(oldTexture.width + data.nx + data.px, oldTexture.height + data.ny + data.py, buf);
		CANVAS_TEXTURE.copy(data.nx, data.ny, oldTexture);
	}
	else if (data.id === CanvasEvent.COLORS)
	{
		COMPONENT_STATE.colors = data.colors;
	}
	else if (data.id === CanvasEvent.COOLDOWN)
	{
		COMPONENT_STATE.cooldown = data.cooldown;
	}
});