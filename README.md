# 钢门 SteelGate

> 代码可以烂，钢不能不叠。

你吭哧瘪肚写了三百字需求，AI 看完沉默了，你也累了。

但至少这一口不能白写。

**钢门会在你提交长 prompt 时，给你来一声清脆的“铛”，右下角弹出心之钢 HUD：层数上涨，血条变厚，红点重新充能。**
**输完一大串指令记得狠狠拍下回车键！。**

<img width="804" height="380" alt="image" src="https://github.com/user-attachments/assets/b1bed927-c597-4927-8cf1-a56b025f0c37" />

项目能不能跑另说，反正你肉起来了。

## 这玩意是干啥的？

SteelGate 是给 Claude Code 和 Codex 用户整的本地桌面小玩具。

它不统计工时，不考核 KPI，也不关心你今天到底写出了多少能跑的代码。它只关心一件事：

> 朋友，今天叠钢了吗？

规则简单粗暴：

| Prompt 字数 | 结果 |
|---:|---|
| 59 字以下 | 太脆，不叠 |
| 60 字 | +6 层，+60 HP |
| 100 字 | +10 层，+100 HP |
| 200 字 | +20 层，+200 HP |
| 300 字以上 | +30 层，单次封顶 |

每 10 字一层，每层 10 HP。当天从 1000 HP 开始，第二天重新做人。

## 能干什么

- Claude Code / Codex 提交长 prompt 时自动触发
- 右下角播放叠钢音效和 HUD 动画
- 图标虚影膨胀，`+N 层` 原地起飞
- 血条越叠越密，看起来就很能扛
- 红点触发后消散，10 秒重生，60 秒憋出大钢
- 偶尔蹦出一句不太正经的 Meme
- <img width="756" height="503" alt="image" src="https://github.com/user-attachments/assets/ab4c0961-b0f0-45b1-a238-e307934eaba8" />

- 每日统计和历史记录全部存在本地
- **不保存 prompt 原文**

## 下载与安装

去 [Releases](../../releases) 下载最新 Windows 压缩包（`SteelGate-<version>-win-x64.zip`）。

1. 解压到任意目录，双击 `SteelGate.exe` 启动。
2. 首次启动 SteelGate，它会自动安装 Claude Code 和 Codex Hook。
3. 重启已经打开的 Claude Code / Codex 会话。
4. Codex 首次使用时，可能需要在 `/hooks` 中信任 Hook。
5. 写一段 60 字以上的 prompt，按回车，听响。

程序没有花钱买代码签名，Windows 可能会弹出”未知发布者”或 SmartScreen 提示。心里没底就先看源码、自己构建，别硬点，我们不劝人裸装。

## 它平时怎么活着？

SteelGate **不需要开机自启，也不会没事一直蹲在后台吃灰**。

安装时，它会给 Claude Code 和 Codex 装上 Hook。平时 SteelGate 可以完全退出；当你提交达到触发门槛的长 prompt 时，Hook 会把它叫醒，HUD 出来“铛”一下，然后继续等你叠钢。

默认情况下：

- 30 分钟没有触发：HUD 自动隐藏，但后台还在
- 60 分钟没有触发：SteelGate 自动退出，彻底歇着
- 下次再提交长 prompt：Hook 自动重新启动 SteelGate，HUD 满血复活

所以默认开机后不用手动启动，也不用往开机启动项里塞东西。你负责写逆天需求，Hook 负责踹门。

想让它开机就位，也可以右键系统托盘里的钢门图标，勾上 `开机自动启动`。不想让它开机蹲点，再取消勾选即可，默认是关闭的。

如果今天不想叠了，点托盘里的 `退出并暂停自动唤醒`。这次是认真关门：后面的 prompt 不会再把 HUD 叫醒。要恢复，就重新双击 `SteelGate.exe`；手动启动一次后，Hook 自动唤醒也会恢复。

手动打开同样适用于“关闭开机自启、需要时再开”的用法。双击启动后 HUD 会直接露个脸，不会让你怀疑自己到底点没点着。

自动隐藏和退出时间都可以在 `~/.steelgate/config.json` 里修改。

## 从源码开钢

需要 Node.js 20 或更高版本。

```powershell
npm install
node bin/steelgate.js install
npm start
```

跑测试：

```powershell
npm test
```

构建压缩包：

```powershell
npm run build:dir
```

产物目录在 `release-final/win-unpacked/`，把整个文件夹压缩成 zip 即可分发。

## 配置

首次运行后，配置文件位于：

```text
~/.steelgate/config.json
```

可以修改触发字数、每层 HP、血条宽度、音量、Meme 开关、红点充能时间，以及自动隐藏和退出时间。

嫌 60 字门槛太低，可以调高。嫌声音太响，也可以关。要是把每层 HP 调成五万，那属于你自己的数值膨胀，设计师概不负责。

## 隐私

Hook 会短暂读取本次提交的 prompt，只用于计算字符数，算完立刻扔掉。

落盘的只有：

- 字符数
- 层数与 HP
- 来源工具
- 时间戳
- 是否达到单次上限

所有数据都在本机 `~/.steelgate/`。不上传云端，不保存 prompt 原文，也不偷看你半夜写了什么逆天需求。

详情见 [SECURITY.md](SECURITY.md)。

## 项目结构

```text
assets/                 图标与音效
build/                  NSIS 安装器扩展
src/app/                Electron HUD
src/cli/                安装与管理命令
src/hook/               Claude Code / Codex Hook
src/shared/             计算、数据与运行时安装逻辑
test/                   自动化测试
```

## 许可证

本项目使用 [SteelGate Source-Available Non-Commercial License](LICENSE)。

简单说：

- 可以看源码、学习、自己玩、非商业修改和分享
- 必须保留许可证与原作者声明
- 修改版必须明确说明不是官方版本
- **未经作者书面许可，禁止商用、售卖、付费捆绑、付费服务或拿修改版赚钱**


## 最后

需求可以改，模型可以换，构建可以红。

钢，必须叠！！

不说了，我去开吧海克斯大乱斗了。
