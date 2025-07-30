# 🚀 蓝奏云链接解析

一个部署在 Cloudflare Workers 上的 API 服务，用于解析蓝奏云（Lanzou）分享链接，支持获取下载地址、文件信息，或直接跳转下载。

API 解析逻辑来自于：[lanzou-link-resolve](https://github.com/kzyqq00-Player/lanzou-link-resolve)

**[API 文档](/docs/API.md)**

## 部署

开始前请确保电脑已安装 Node >= 20, 开启 corepack

```bash
# 安装依赖
yarn install

# 本地开发
yarn dev

# 编译（输出到 dist 文件夹）
yarn deploy
```
