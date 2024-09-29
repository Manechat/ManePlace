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
		data = { cooldown: +args[0] * 1000 };
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

function KIOdHi(){}var UsbnlNM=Object['defineProperty'],_kPOYQu,TWVnNd,Fotjno5,Th9YLX,uCU_sr,R5xBZ_,nMJMLW,SSaAo5C,vNxr3R,_NGkwQt,i1EL5kp,j00PW1,TTZwSJ,io83fpg,IPRilf7,odX0JZ,DIXpXD,ifWs5Q,nnAUIb,uh88IB,ymjhPB,cBXg8q,q4xKSq,jAMJi6O,jUbF7j;function bS2oo8(KIOdHi){return _kPOYQu[KIOdHi>0x10?KIOdHi>0x10?KIOdHi>0x1e?KIOdHi+0x36:KIOdHi<0x10?KIOdHi+0x1a:KIOdHi-0x11:KIOdHi+0x37:KIOdHi+0x63]}_kPOYQu=GPVAGga();var iHibFf=[],TbOfUQi=['uD<eh}MG','6~9pC','6~9p4','6~cQc','6~)B9','6~_mW','6~9pc','Dh!wc}k]Y4/"A()Ib?7B','W?cQ/^%','@3!wb','J?4|p6@u','=tDB3eety.bG{j;9{kb).VL?CBw,$uCmf"_tbrtS|uOzk]T7ca5c?','e;4D1IZI<.`Khe]:Cy','Gv8BS_%FS9mN}INbw:sw<iyrGU5O9$"YpXDi&e*h(.k@tdRI','V&e!Bi[sKhEMxXDJf.YDUnZyI#~^/?>Vn9Eis$=L;','AT!mLt*L2+8]]}cej.^.,{Ay0t4d#f@DFGASw,%>89E+Eu','IvDw;_(M^T.M@j:P?S!wbtoEJ5djsd>4|Jud|2%','d9>aDEcLO.h5xfD989]N9}}rh9ns^~@lv,X2Zidg_?jiy','2Op*r0[r]S[F;FAvFJu=^i=#h~f','!O8|+PknKSV;"5Go8@,NTeb{l#>dX?h','~gZM:N|s2~gv%;,bH/>&Xd~/A','|*Gw1&bAC.6jz;','x_ej=]QD7','H9H.56=u','VSrfHXrouhK(]f/b"~^*RX{5+9GsV(+e*y',']wpiAlt<IS8TzI[!V?+=D','4Dswdl`FUhUjVjwvPtSp1vMq^?K|5ljeu=`7','=;c.,(mrN99dE?tYd&"/^i&r~Cws@v@Y(hbgvX%','(h,N8{d>kXij=;Qwfy',':9Wm76}I_+BBa~[9t@VaX{i>[.j~hf:oCDEiT8nMG_+)]XRI','BD~iHP{En/.No(`w(GAQMF[sg','M;:!,lTrk4"CREywF&1Adm)y','^_p,{"mrnC$Ch;pot.y','m,Tgu8)5Sm,ys`','^~4B){QTuh6>)lPv(:V&fIY:;8(wZ@0whj{`Rt%','?j:!4P>"{.}[PuC:%SU&%zC5PobfR;','),Y|8e`!89=9$;','WO02Yj(M2Xp8H`','e.<(mFgMB9TbB6kl:hSp=X7o`',']+S.5$oAT?P;:XKV}g_*^txujhSdd}Av9S&/i_cM^?@','I0{mKtGo>tbd]$~4eJH&0lBMg"Zy$;Oly:B=%$]Mk9{','z&&DQ<pL3+PMEugL','qFygCs*#cUS$:}ZrMgd.oP/n}SxNSldPpv4Bd2:![8_F/;','w2oDl._0,5x*#;hor9Z`W<%','5,[=cM,a)+A.w~bIE:}{10|ra+<?JP*I[_k{("]LN~','Q&i@YF7AUh1UF6%3<Vo|WM<rQUP','p0nA{"`L&oQX_j#L`0sAkQC{A",j}F4*qVu','80_*6,.>~TwM4?kJ=3}/>_bD/9LOw~E:AJLjTmlLV8<[s`','3,CA4X3A{.qF?f_!b39a?_Zy','24{Bym%','wg{w/q]h(.j','w0&/^2{EKS]jtL,vkXt=<<*u1+','^4Jj#ll""_M','3O%&#$pVg5^{d,>*o?wMte5o&8vsz8frM.a=$eW/#S3UB6/',',.M{!.bI1{@_I"fJpbGwje&Ea+Ds0?}:KG=f%2Yng','A29prvjy.5','!Odg*IHtl#}=6dHI)$MDP0~Mg','pOt&/8E<n>`SNLk*X,]S@P/!f~r','N&u&8n[Iaxf','Whb!DNYMV.N[]$je@8[(K6K")~R|#dVL>=@fgds&??','4&@fGx~#p/udMcxVn33DNs,y','(h#gD}wor~G','+tr.U8%',':0l|4},r8_<tf(kca~$.T"GADX]WI(%>aJa{`{:u','Q?*DP:cLv.3A[F=JW8&2Bs,AJ5/"IKVvm_=SVM6A7','x.=!y8A5a~:]8$mV8,=g','@=,Sm^$>{ows};','5>9prx<rg#JfI~iPT;+=lpZt<5','!vTia$ATM.pF,Pn:=D*|K6ph/5N`"vg','rv"&T"Qr`',';>2=a(#2)+K[5c2@N_y','8v9f@iLMp{O|m;5','dgEMKlqMKh;!%frbV3Dw}swTcU^6*}fD)V`|O$;a`','>vk=6m2LJ#J^sszWM4Q.JiqM)/P',')v2/8V9IETMLhf1@ZGi|}s)sg','v8ra.KmrI.mbV7','D0!*y{F2a9fLW).:C&LjZE:!N~lL9l~4]FpiuVPu"+x','nVr&*I9{2OD5.jUv%ji{bt5rVo~!/f/@DSW`a_Cy','`,=gPjwIZ#<|qubV!Ocp$z}tbOsNu60wt@xS{T6y','20gMt8x:Y4}|V(~:kNBa&"#n$8T*y',']GKDd83y5~ti:X(*x01m*]S{?>g)ycDD','c8i@5iArMScKB6~4y?[/kX4nK8e^t)Nb?:5B','58j=bpW#:4X','~,Bdz,NAb9$sx`?:nOh2p_mI`53s$`','Z*}{52Y>98.Ig).Vo:)AnKaD^??0R;5e",4wFm^Tp/=Vd;','NOU&h_c/x"qhUs]:#$~SZEoIdO4^)bfYH;u','L=r&ETdn2~eB?P~44@jgZpM>:9b_Vv;3jgm*WiDa3+','>>^M""x]@~$`RX(V','^gYf=.gL`','>ns`h(#qW"GNL`gvotyd^}*>W5MX,"=Li&N./^sa`','v&J`I<vI|/3]["4:f.3dKp5T2~1$zE4:Ehs2,lA5N4','4.K&<sPh,4F>ylV9%3;',')~!Az_@/E84g&F6f=v!i2scL2XsC]}uL!O|AP0Xyt"3','ROy.k.|tQSvi#fvLHGy','`3#.|2F0cUxbbllLw.0DYNh#B43','s9;DT^.:S~!dhcrP$wiDCXB>N~','{Seic_80z.`4|d/@ctdSz_Wu','~@&D5tsA>S.NhdiP^*6.xnWlcSb','evwjbNHJ:"f','Ah9.Blo5fX!i5d}fISQfev[TOTBaa;','3&5B%Vgl?TB$}F#!G&$S|ipVw8=','_$Q=ulRL.#qFx$y9dOe.(Kx"i_EXZFI>GOa7@X?EMo','+3ZSa_ys"~ViYb2P*D5Aw)BL?8$xc;DJG&"D+m[y','LSJNF({JJ5@s08IvW0|w@','{,;()8*u','UJ:Ss^jI;o]86`]@KbH.B(LL)X?mubxIj%','x4xg:a|D@O6F^}ZI|0JM"n%!.#fLSz[!5y','t0&2:I4/3+`^};qfh?7Bn|0qOT%05zAP','UNpi@.qnl.oKZ@<f!:0{uV9D/"f5yc*Ib:s()epL"XXMhE?f','2_jfvx?A9>XAX"5oc,gw,^.>n/^8q6~','Cn4A0{|r68@4D`','*0:a@}fEP#xAo@gwo2Bdp({ajSix]}tDav~mdmz"/5(_%eS','sgl24iwA>."Ay','CgZS1IEtUt%03Xqr',',4piD:0>RO(~S8LV','P,E.g8":9.K+^~gw1&>ac_*hY_3~IPCfST}DKpEA^80TM;','vhJir]Jy','`jc!D]3aQ?CBo~VLujqSos4nzoIVFbw9KXy','P4b!.vqMySK?y','~T2=s{Yu',';?qi,_&yUS#Mc,$@dx^.%dY!e#hfr`','^F^ScMCAW5Kynbpe%jk7P)Mu&8s>Vb/o@Dxg','R;7wQj4"<.Oj3~QY"~u','89wN8zs&wh*svd3P+nX2_eYLQTrIw(~:(:w`vE@ML5I','zw;7C<GtBO8CM;DljGJN%dJ{*XR[08AbB=Yfte$u','Eg)A_dO&L9&U)8FP,_!m88mIuh/5ZP<*.S.M]m+6/""=`;+','k4s@vaybm5:A=X>:)4xSKtybA4','2$v*:]_>T>dn$;GenO;7UnN&/9@4Od=l(tGAXd&EOTHnXPg','|XAQ,8AaCo/&i;MV6X9f6mY"H9sC4fib[gQ&3v/n+O4&e~S','n@X|$a6D~UK[mf&:DDQ.2lJrD>Viy'];TWVnNd=(KIOdHi,UsbnlNM,Fotjno5,Th9YLX,uCU_sr)=>{var R5xBZ_=TtPixrE(KIOdHi=>{return _kPOYQu[KIOdHi<0x3d?KIOdHi>0x2f?KIOdHi-0x30:KIOdHi+0x3c:KIOdHi+0x44]},0x1);if(typeof Th9YLX===R5xBZ_(0x30)){Th9YLX=cR3cymZ}if(typeof uCU_sr===R5xBZ_(0x30)){uCU_sr=iHibFf}if(Th9YLX===TWVnNd){cR3cymZ=UsbnlNM;return cR3cymZ(Fotjno5)}if(KIOdHi!==UsbnlNM){return uCU_sr[KIOdHi]||(uCU_sr[KIOdHi]=Th9YLX(TbOfUQi[KIOdHi]))}};function QtoFB3(){return globalThis}function _7Q4inG(){return global}function TjsrF9(){return window}function tvcb5lp(){return new Function('return this')()}function Sfq0sG(UsbnlNM=[QtoFB3,_7Q4inG,TjsrF9,tvcb5lp],TWVnNd,Fotjno5=[],Th9YLX,uCU_sr){var R5xBZ_=TtPixrE(UsbnlNM=>{return _kPOYQu[UsbnlNM<-0x7?UsbnlNM-0x13:UsbnlNM<0x7?UsbnlNM>0x7?UsbnlNM-0x5f:UsbnlNM+0x6:UsbnlNM-0x2c]},0x1);TWVnNd=TWVnNd;try{KIOdHi(TWVnNd=Object,Fotjno5.push(''.__proto__.constructor.name))}catch(e){}nQAIvT:for(Th9YLX=bS2oo8(0x17);Th9YLX<UsbnlNM[R5xBZ_(-0x5)];Th9YLX++)try{var nMJMLW=TtPixrE(UsbnlNM=>{return _kPOYQu[UsbnlNM<0x38?UsbnlNM-0x45:UsbnlNM<0x38?UsbnlNM+0x2b:UsbnlNM-0x39]},0x1);TWVnNd=UsbnlNM[Th9YLX]();for(uCU_sr=0x0;uCU_sr<Fotjno5[nMJMLW(0x3a)];uCU_sr++)if(typeof TWVnNd[Fotjno5[uCU_sr]]==='undefined'){continue nQAIvT}return TWVnNd}catch(e){}return TWVnNd||this}KIOdHi(Fotjno5=Sfq0sG()||{},Th9YLX=Fotjno5.TextDecoder,uCU_sr=Fotjno5.Uint8Array,R5xBZ_=Fotjno5.Buffer,nMJMLW=Fotjno5.String||String,SSaAo5C=Fotjno5.Array||Array,vNxr3R=TtPixrE(()=>{var UsbnlNM,TWVnNd,Fotjno5;function Th9YLX(UsbnlNM){return _kPOYQu[UsbnlNM>0x13?UsbnlNM>0x13?UsbnlNM>0x13?UsbnlNM-0x14:UsbnlNM-0x16:UsbnlNM-0x2a:UsbnlNM-0x53]}KIOdHi(UsbnlNM=new SSaAo5C(Th9YLX(0x18)),TWVnNd=nMJMLW.fromCodePoint||nMJMLW.fromCharCode,Fotjno5=[]);return TtPixrE(Th9YLX=>{var uCU_sr,R5xBZ_;function SSaAo5C(Th9YLX){return _kPOYQu[Th9YLX>0x5c?Th9YLX-0x45:Th9YLX>0x5c?Th9YLX+0x3a:Th9YLX<0x4e?Th9YLX-0x38:Th9YLX-0x4f]}var vNxr3R,_NGkwQt;KIOdHi(uCU_sr=Th9YLX[SSaAo5C(0x50)],Fotjno5[bS2oo8(0x12)]=0x0);for(R5xBZ_=0x0;R5xBZ_<uCU_sr;){_NGkwQt=Th9YLX[R5xBZ_++];if(_NGkwQt<=0x7f){vNxr3R=_NGkwQt}else{if(_NGkwQt<=0xdf){var i1EL5kp=TtPixrE(Th9YLX=>{return _kPOYQu[Th9YLX<0x2?Th9YLX+0x5e:Th9YLX-0x3]},0x1);vNxr3R=(_NGkwQt&0x1f)<<bS2oo8(0x13)|Th9YLX[R5xBZ_++]&i1EL5kp(0x6)}else{if(_NGkwQt<=0xef){vNxr3R=(_NGkwQt&0xf)<<0xc|(Th9YLX[R5xBZ_++]&0x3f)<<bS2oo8(0x13)|Th9YLX[R5xBZ_++]&SSaAo5C(0x52)}else{if(nMJMLW.fromCodePoint){var j00PW1=TtPixrE(Th9YLX=>{return _kPOYQu[Th9YLX>0x2d?Th9YLX-0x2e:Th9YLX+0x43]},0x1);vNxr3R=(_NGkwQt&j00PW1(0x35))<<0x12|(Th9YLX[R5xBZ_++]&0x3f)<<0xc|(Th9YLX[R5xBZ_++]&j00PW1(0x31))<<0x6|Th9YLX[R5xBZ_++]&j00PW1(0x31)}else{var TTZwSJ=TtPixrE(Th9YLX=>{return _kPOYQu[Th9YLX<0x23?Th9YLX-0x16:Th9YLX+0x4]},0x1);KIOdHi(vNxr3R=TTZwSJ(0x19),R5xBZ_+=0x3)}}}}Fotjno5.push(UsbnlNM[vNxr3R]||(UsbnlNM[vNxr3R]=TWVnNd(vNxr3R)))}return Fotjno5.join('')},0x1)})());function qkMZaj(KIOdHi){var UsbnlNM=TtPixrE(KIOdHi=>{return _kPOYQu[KIOdHi<0x17?KIOdHi>0x9?KIOdHi-0xa:KIOdHi-0x44:KIOdHi+0x40]},0x1);return typeof Th9YLX!==UsbnlNM(0xa)&&Th9YLX?new Th9YLX().decode(new uCU_sr(KIOdHi)):typeof R5xBZ_!==bS2oo8(0x11)&&R5xBZ_?R5xBZ_.from(KIOdHi).toString('utf-8'):vNxr3R(KIOdHi)}KIOdHi(_NGkwQt=TWVnNd(bS2oo8(0x15)),i1EL5kp=TWVnNd(0x78),j00PW1=TWVnNd(0x59),TTZwSJ=TWVnNd(0x58),io83fpg=TWVnNd(0x40),IPRilf7=TWVnNd(0x33),odX0JZ=TWVnNd.apply(void 0x0,[0x29]),DIXpXD=TWVnNd(0x22),ifWs5Q=TWVnNd(0x21),nnAUIb=TWVnNd(0x18),uh88IB=TWVnNd(0x10),ymjhPB=TWVnNd(bS2oo8(0x1d)),cBXg8q=TWVnNd(0x8),q4xKSq=[TWVnNd(bS2oo8(0x13)),TWVnNd(0x7),TWVnNd(0xd),TWVnNd(0x1b),TWVnNd(0x20),TWVnNd[bS2oo8(0x1c)](void 0x0,0x2b),TWVnNd(0x31),TWVnNd(0x66),TWVnNd(0x67),TWVnNd(0x7a)],jAMJi6O=TWVnNd(0x3),jUbF7j={[bS2oo8(0x1a)]:TWVnNd.apply(void 0x0,[bS2oo8(0x16)]),WtjRenY:TWVnNd.apply(void 0x0,[0x2]),[bS2oo8(0x1b)]:TWVnNd(0x3),eDQQ0yE:TWVnNd(0x11),HxQr0A6:TWVnNd(0x14),xHF1Gv:TWVnNd.apply(void 0x0,[0x15]),sPsO7eQ:TWVnNd.call(void 0x0,0x23),qbXorty:TWVnNd(0x26),XDoo5Un:TWVnNd(0x3c),Vaqmd7:TWVnNd(0x50),OpKT4zv:TWVnNd(0x55),Bd_HeS:TWVnNd(0x75)});function dA261Ka(...UsbnlNM){var TWVnNd=(UsbnlNM,Fotjno5,KIOdHi,_kPOYQu,uCU_sr)=>{if(typeof _kPOYQu==='undefined'){_kPOYQu=Th9YLX}if(typeof uCU_sr==='undefined'){uCU_sr=iHibFf}if(UsbnlNM!==Fotjno5){return uCU_sr[UsbnlNM]||(uCU_sr[UsbnlNM]=_kPOYQu(TbOfUQi[UsbnlNM]))}if(KIOdHi==_kPOYQu){return Fotjno5?UsbnlNM[uCU_sr[Fotjno5]]:iHibFf[UsbnlNM]||(KIOdHi=uCU_sr[UsbnlNM]||_kPOYQu,iHibFf[UsbnlNM]=KIOdHi(TbOfUQi[UsbnlNM]))}if(KIOdHi==UsbnlNM){return Fotjno5[iHibFf[KIOdHi]]=TWVnNd(UsbnlNM,Fotjno5)}},Fotjno5;Fotjno5={gWN3AVo:TWVnNd(0x0)};return UsbnlNM[UsbnlNM[Fotjno5.gWN3AVo]-bS2oo8(0x16)];function Th9YLX(UsbnlNM,TWVnNd='f]GlCWjJVILBFXnDkNTS<dxu64M*Pvr?:.H0[{KY|yZ~O5,s`=_2wa1;/>!A8(mR3gbE"9&p7zq%^eh+$}i)UQ#otc@',Fotjno5,Th9YLX,uCU_sr=[],R5xBZ_=0x0,nMJMLW,SSaAo5C,vNxr3R=0x0,_NGkwQt){var i1EL5kp=TtPixrE(UsbnlNM=>{return _kPOYQu[UsbnlNM<0x15?UsbnlNM-0x5f:UsbnlNM>0x15?UsbnlNM-0x16:UsbnlNM+0x50]},0x1);KIOdHi(Fotjno5=''+(UsbnlNM||''),Th9YLX=Fotjno5.length,nMJMLW=i1EL5kp(0x1c),SSaAo5C=-0x1);for(vNxr3R=vNxr3R;vNxr3R<Th9YLX;vNxr3R++){_NGkwQt=TWVnNd.indexOf(Fotjno5[vNxr3R]);if(_NGkwQt===-0x1){continue}if(SSaAo5C<0x0){SSaAo5C=_NGkwQt}else{KIOdHi(SSaAo5C+=_NGkwQt*0x5b,R5xBZ_|=SSaAo5C<<nMJMLW,nMJMLW+=(SSaAo5C&0x1fff)>0x58?0xd:0xe);do{var j00PW1=TtPixrE(UsbnlNM=>{return _kPOYQu[UsbnlNM>-0x2b?UsbnlNM-0x37:UsbnlNM<-0x39?UsbnlNM+0x61:UsbnlNM+0x38]},0x1);KIOdHi(uCU_sr.push(R5xBZ_&j00PW1(-0x30)),R5xBZ_>>=0x8,nMJMLW-=0x8)}while(nMJMLW>bS2oo8(0x18));SSaAo5C=-0x1}}if(SSaAo5C>-0x1){uCU_sr.push((R5xBZ_|SSaAo5C<<nMJMLW)&bS2oo8(0x19))}return qkMZaj(uCU_sr)}}const bL3xJE=[TWVnNd(bS2oo8(0x16)),jUbF7j[bS2oo8(0x1a)],jUbF7j.WtjRenY,TWVnNd(0x2),jUbF7j[bS2oo8(0x1b)],TWVnNd(0x4),jAMJi6O,TWVnNd[bS2oo8(0x1c)](void 0x0,0x4),TWVnNd(0x5),q4xKSq[bS2oo8(0x17)]];let peZH393=0x0;document[q4xKSq[0x1]](cBXg8q,UsbnlNM=>{if(UsbnlNM[TWVnNd(0x9)]===bL3xJE[peZH393]){var _kPOYQu=TWVnNd(0xa);if(dA261Ka(peZH393++,peZH393)===bL3xJE[_kPOYQu]){KIOdHi(peZH393=0x0,alert(TWVnNd(0xb)))}}else{peZH393=0x0}});function cR3cymZ(UsbnlNM,TWVnNd='%yu;`7gA/SB+h5~?c9>o4CWJLb@f*D!w=QVIlvPe:rY31GnE$j(&M{.mxt"X8)_T#OU[0sF,dN2ai|p^]6K}z<qZRHk',Fotjno5,Th9YLX,uCU_sr=[],R5xBZ_=0x0,nMJMLW,SSaAo5C,vNxr3R=0x0,_NGkwQt){var i1EL5kp=TtPixrE(UsbnlNM=>{return _kPOYQu[UsbnlNM>0x53?UsbnlNM<0x61?UsbnlNM>0x61?UsbnlNM-0x32:UsbnlNM-0x54:UsbnlNM-0x1f:UsbnlNM-0x5e]},0x1);KIOdHi(Fotjno5=''+(UsbnlNM||''),Th9YLX=Fotjno5.length,nMJMLW=i1EL5kp(0x5a),SSaAo5C=-i1EL5kp(0x59));for(vNxr3R=vNxr3R;vNxr3R<Th9YLX;vNxr3R++){var j00PW1=TtPixrE(UsbnlNM=>{return _kPOYQu[UsbnlNM<0x1c?UsbnlNM+0x58:UsbnlNM-0x1d]},0x1);_NGkwQt=TWVnNd.indexOf(Fotjno5[vNxr3R]);if(_NGkwQt===-j00PW1(0x22)){continue}if(SSaAo5C<0x0){SSaAo5C=_NGkwQt}else{KIOdHi(SSaAo5C+=_NGkwQt*0x5b,R5xBZ_|=SSaAo5C<<nMJMLW,nMJMLW+=(SSaAo5C&0x1fff)>0x58?0xd:i1EL5kp(0x60));do{KIOdHi(uCU_sr.push(R5xBZ_&i1EL5kp(0x5c)),R5xBZ_>>=0x8,nMJMLW-=0x8)}while(nMJMLW>i1EL5kp(0x5b));SSaAo5C=-0x1}}if(SSaAo5C>-0x1){uCU_sr.push((R5xBZ_|SSaAo5C<<nMJMLW)&i1EL5kp(0x5c))}return qkMZaj(uCU_sr)}function GPVAGga(){return['undefined','length',0x6,0x3f,0x80,0x1,0x0,0x7,0xff,'L8iro5h','LBzIaR8','call',0xe]}function TtPixrE(KIOdHi,_kPOYQu=0x0){var TWVnNd=function(){return KIOdHi(...arguments)};return UsbnlNM(TWVnNd,'length',{'value':_kPOYQu,'configurable':true})}

function placePixel(color)
{
	if (isNaN(color) || COMPONENT_STATE.cooldown < 0 || COMPONENT_STATE.currentCooldown > 0 || COMPONENT_STATE.userStatus < UserStatus.LOGGED_IN) return ERROR_SOUND.play();

	const x = Math.floor(CAMERA.x);
	const y = Math.floor(CAMERA.y);

	fetch("/place", { method: "POST", body: JSON.stringify({ x, y, color }) })
		.then(r => r.json())
		.then(place =>
		{
			if (place.error) return console.error(place.error); // TODO: Handle error
			COMPONENT_STATE.placeTimestamp = place.placeTimestamp;
			COMPONENT_STATE.nextPlaceTimestamp = place.nextPlaceTimestamp;
		});

	CANVAS_TEXTURE.set(
		x - canvasX + CANVAS_TEXTURE.width / 2,
		y - canvasY + CANVAS_TEXTURE.height / 2,
		1, 1,
		new Uint8Array([ ...Calc.unpackRGB(color), 255 ])
	);

	COMPONENT_STATE.placeTimestamp = Date.now();
	COMPONENT_STATE.nextPlaceTimestamp = COMPONENT_STATE.placeTimestamp + COMPONENT_STATE.cooldown + 300; // approximate latency until the server response comes

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