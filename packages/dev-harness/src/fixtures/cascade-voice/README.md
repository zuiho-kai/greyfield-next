# 连续语音合成麦克风样本

三个 WAV 都是合成语音，不含真实房间或真人麦克风录音。

- `hello.wav`：我今天有点累，你陪我说两句吧。包含约 500 毫秒自然停顿，用于验证前半句不会在后续起音取消 ASR 时丢失。
- `interrupt.wav`：停一下，先告诉我二加二等于几。用于播放期间插话。
- `example.wav`：请打开 example 点 com，告诉我页面标题。用于真实网页工具闭环。

`electron-cascade-voice-check.ts` 将这些 WAV 经 WebAudio 注入合成麦克风，再走应用自己的 PCM/VAD、真实供应商、实际播放器和 Live2D。它不证明真人声学环境或回声抑制。
