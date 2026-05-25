import { resolveLive2DFixturePath, toViteFsModelUrl } from "./live2d-fixture";

const modelUrl = toViteFsModelUrl(resolveLive2DFixturePath());
const baseUrl = process.env.GREYFIELD_DESKTOP_URL ?? "http://127.0.0.1:5173/";
const url = new URL(baseUrl);
url.searchParams.set("live2dModel", modelUrl);

console.log(url.toString());
