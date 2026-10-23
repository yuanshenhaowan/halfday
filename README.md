# 羽 · 半日闲

一个安静的个人主页：日程提醒、习惯打卡、随记。

线上地址：https://yuanshenhaowan.github.io/halfday/

## 谁能改、谁能看

没有服务端、没有登录、没有数据库。

线上站是 `data/content.json` 的一份**静态快照**，构建时（其实是纯静态托管、原样投递）就固定了。
访客拿到的是它渲染出来的字节：页面上没有一个能提交的表单，也没有任何接口。

唯一能重写这份快照的人，手里有**发布凭证** —— 一枚只对 `yuanshenhaowan/halfday` 这一个仓库、
只有 `Contents: Read and write` 权限的 GitHub fine-grained token。

- 凭证存在他自己那台浏览器的 localStorage 里（键名 `yu_publish_pat`），不经过任何服务器。
- 有凭证：页面识别为主人，出现编辑入口；改完点「发布」，内容被写进仓库，GitHub Pages 重建后访客才看得到。
- 没有凭证：页面是访客视角，所有写着「改」的地方根本不存在。
- 换设备要重新粘一次凭证；点「移除这台设备的凭证」即回到访客。

## 结构

| 文件 | 作用 |
|---|---|
| `index.html` | 页面骨架 |
| `style.css` | 全部样式（璃月风 · 浅蓝） |
| `app.js` | 交互 + 发布（GitHub Contents API）+ 生成日历 |
| `data/content.json` | 内容快照 —— 全站唯一的内容来源 |
| `calendar.ics` | 日历订阅源，发布时随内容一起重写 |
| `sw.js` | 离线缓存（`content.json` 走网络优先，不会用旧内容顶上去） |

## 提醒：网页关着怎么办

页面里的提醒靠 `setInterval` 到点调通知接口，**只在页面活着时跑**，关掉就没了。

要看得到「关了网页也提醒」，用日历订阅：

```
https://yuanshenhaowan.github.io/halfday/calendar.ics
```

填进 iPhone / Android / 电脑日历的「订阅日历 · 添加日历网址」。这份 `.ics` 在每次「发布」时重写，
日历客户端定期拉取后自动跟进；每个日程的「提前 N 分钟」写成 `VALARM`，到点由**系统**弹提醒，
跟浏览器死活无关。

实现要点：时间一律写 UTC（带 `Z`），不附 `VTIMEZONE`，任何客户端都不会读错时区；
按 RFC 5545 折行，折点是按 UTF-8 **字节**算的（不然会把汉字劈成两半）。已完成的事不进日历。

## 发布流程

1. 主人在页面上改内容 → 改动先落在本机 localStorage，底部浮出「有改动还没发布」。
2. 点「发布」→ 依次 `PUT` 两个文件：`data/content.json`、`calendar.ics`。
3. GitHub Pages 大约 30 秒后重建完成，访客刷新即见。

## 本地跑

```bash
python -m http.server 4380
# 打开 http://127.0.0.1:4380/
```

`data/content.json` 是 `fetch` 拉的，`file://` 直接打开会被 CORS 拦；必须起一个静态服务器。
