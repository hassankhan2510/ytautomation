import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setConcurrency(2);
// GitHub runners have no GPU: "angle" can't create a WebGL2 context (shader transitions/effects
// crash). "swangle" = SwiftShader behind ANGLE → full WebGL2 on the CPU.
Config.setChromiumOpenGlRenderer("swangle");
