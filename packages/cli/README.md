# @codescribe/cli

码著 CodeScribe 的命令行安检工具。在本地对源码执行注释删除与敏感信息脱敏，**代码不出本机**，可用于把代码粘贴给 AI / 上传前先清理敏感信息。

## 安装

```bash
npm i -g @codescribe/cli
# 或 npx 免安装：
npx @codescribe/cli scrub <file>
```

## 用法

```bash
# 清洗并脱敏单个文件，结果输出到 stdout
codescribe scrub src/config.ts

# 管道输入（默认按 C 系语法，可加扩展名）
cat code.ts | codescribe scrub
cat code.py | codescribe scrub py

# 选项
codescribe scrub app.ts --keep-comments   # 保留注释（仅脱敏）
codescribe scrub app.ts --no-mask         # 不脱敏（仅删注释/空行）
codescribe scrub app.ts --keep-blank      # 保留空行
```

`scrub` 会：
- 删除注释（字符串内的 `//`、`/* */` 等不会被误删，复用与桌面端一致的状态机）
- 删除空行
- 脱敏 API Key / 密钥 / 内网 IP / 大陆手机号

清洗结果输出到 stdout，统计信息（清洗行数 / 脱敏行数）输出到 stderr。

## 与桌面端的关系

脱敏逻辑与桌面端 CodeScribe 完全一致（来自 `@codescribe/core`）。桌面端面向软著申报文档生成；CLI 面向「把代码交给第三方前先脱敏」的安检场景。

## 安全声明

- 所有处理均在本地完成，代码不会上传到任何服务器
- 内网 IP、密钥等敏感信息会被打码后输出
- 如需更强的自定义脱敏规则，请使用桌面端 Pro（规划中）

## 许可

Apache-2.0，与 CodeScribe 主项目一致。