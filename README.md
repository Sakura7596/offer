# offer

`offer` 是一个纯本地的 Windows 秋招管理工具，用来集中记录公司、岗位、投递状态、招聘流程、时间节点、JD、面试复盘和下一步行动。

本项目是基于用户指定的开源仓库 [differance-dfhs/up](https://github.com/differance-dfhs/up) 改造的 Windows 本地版本。当前项目品牌、程序名和本地存储标识统一为 `offer`；上游仓库名称仅在来源说明和许可证语境中保留。

## 主要功能

- 今日行动中心：汇总逾期、今日到期和即将到期的跟进事项
- 投递总表：按生命周期、赛道、渠道、阶段和重视程度筛选
- 当前状态与当前进度分开记录
- 一至五分重视程度，并用由浅到深的颜色区分
- 首页、岗位页、甘特图、日历和分析共用同一份时间线数据
- 可从首页、总表、岗位页和时间规划添加时间节点
- 面试节点可直接记录复盘
- 大量岗位时支持分页、折叠和当日日程展开
- JD 文字、截图、职位链接和备注全部保存在本机
- 多标签冲突保护、自动快照、一键恢复和删除撤销

## Windows 本地安装

需要 Windows、Node.js 和 npm。

```powershell
npm install
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-windows-shortcut.ps1
```

安装后，从桌面打开 **求offer**。快捷方式会在本机启动服务，并用默认浏览器打开：

`http://127.0.0.1:4173/`

个人数据保存在：

`%LOCALAPPDATA%\Offer-AutumnRecruitment\data`

更新源码、重新构建或重新安装快捷方式都不会覆盖该目录。

## 隐私

- 不需要账号、云服务或远程数据库
- 页面服务只绑定 `127.0.0.1`
- 仓库只保留空白 JSON 模板
- 真实公司、岗位、JD、截图、笔记和备份不会提交到 GitHub
- 便携导出由用户主动触发，并由用户自行选择保存位置

## 开发与验证

```bash
npm install
npm test
npm run build
```

本机运行：

```bash
npm run app:start
```

## 可选的 Codex Loop

自动情报流程是可选能力。使用时复制 [docs/codex-loop-prompt.md](docs/codex-loop-prompt.md)，并将 `{{OFFER_DATA_DIR}}` 替换为本机数据目录。

## 数据文件

- `workspace.json`：公司、岗位、JD、笔记和个人时间线
- `intelligence.json`：带来源的机会与岗位情报
- `loop-runs.json`：可选自动情报运行记录
- `backups/`：本机自动快照
- `assets/`：JD 截图和公司图标

仓库中的数据模板保持为空；实际运行文件位于 LocalAppData。

## 上游与致谢

感谢 [differance-dfhs/up](https://github.com/differance-dfhs/up) 提供原始项目基础。本 Windows 版本在其基础上增加并调整了本地启动、Windows 快捷方式、数据持久化、冲突保护、备份恢复、投递管理、行动中心、时间线同步和大数据量展示。

项目仍使用并致谢 [career-ops](https://github.com/santifer/career-ops) 提供的开源求职工作流。详细归属见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## License

[MIT](LICENSE)
