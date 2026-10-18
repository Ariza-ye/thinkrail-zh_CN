---
id: submodule-website-attribution
type: submodule-design
status: active
title: 网站归因认领
parent: module-website
tags: [website, analytics, attribution, cloudflare]
---

## 职责与边界

拥有同源浏览器认领协议，该协议把已同意的网站获客上下文传给已安装的 ThinkRail 宿主。
Cloudflare Pages Functions 暴露该协议，D1 提供短命的原子认领状态。

- **Public surface（公开接口）：** `index.ts` 暴露正常页面的浏览器归因；按目标区分的 `claim.ts`
  与 `server.ts` 暴露无 analytics 的认领页与 Pages handler。这些次级入口点是代码分割边界，
  阻止正常的 analytics/GTM 模块进入认领页或 Worker bundle。service 与 D1 仓库保持内部。
- **允许的依赖：** 用于正常页面记录的网站 analytics 门面、Web Platform API、Pages Functions，
  以及 `ATTRIBUTION_DB` D1 绑定。
- **绝不触碰：** 导入产品的 server/desktop/CLI 代码；PostHog 管理；账户身份；改动安装器或
  安装命令；持久化 user agent、referrer URL、Cookiebot 取值或任意请求体。

## 协议

所有改变状态的路径都要求有效主机名为 `thinkrail.ai`；浏览器绑定还要求确切的同源 `Origin`。
源守卫在预览与同胞主机上仍然在访问 D1 之前返回 not-found。预览部署没有 D1 绑定；该守卫不是
数据隔离边界。请求体与字符串都是有界的，未知字段会被拒绝。

1. `POST /api/attribution/claims` 接受一个 43 字符的规范 base64url SHA-256 `challenge`，原子
   消耗聚合的 D1 创建配额，存储一个随机的 32 字节 base64url 认领 ID 以及创建与过期时间，
   并返回 `claim_id`、相对的 `claim_url`，以及十分钟后到期的 `expires_at` epoch 毫秒时间。
   配额耗尽返回 429。
2. 已安装的宿主打开 `/attribution/claim/?id=<claim>`。加载时，静态路由首先要求 Cookiebot 的
   第一方 `CookieConsent` cookie 当前记录着 Marketing 授权或 `-1`（无需同意）值；否则它不读取
   任何存储并导航到 `/blog/`。具备该授权后，它从浏览器存储读取一份通过校验、未过期的旅程/
   获客上下文，并发起一次绑定尝试；无效的认领 ID 或缺失/无效的上下文绝不绑定。因此一个构造
   出来的认领链接可以绑定已同意访客存储的上下文；这一点被接受，以便该流程绝不打断访客。
3. `POST /api/attribution/claims/<id>/bind` 是先写者胜。它短暂存储旅程 ID、归一化的首次/
   末次触点字段，以及上下文中存在的最新桌面下载 bridge ID。若上下文没有 bridge ID（如 CLI
   认领），bind 会生成一个随机 bridge ID。
4. 在一次有界绑定尝试之后，该路由无论结果如何都把位置替换为 `/blog/`；当认领 ID 或上下文
   无效或不可用时，它也会导航到那里。认领文档不初始化任何 PostHog 或 GTM 加载器，也不发出
   任何浏览器 analytics 事件；其 no-referrer 策略避免 referrer 泄漏，而
   `Content-Security-Policy: frame-ancestors 'none'` 与 `X-Frame-Options: DENY` 防止点击劫持。
5. `status` 与 `redeem` 接受一个规范的 32 字节 base64url `verifier` 并派生其 SHA-256 challenge。
   经 verifier 认证的状态是参考性的。Redeem 使用 `DELETE … RETURNING` 原子消耗一行已绑定、
   未过期的记录，并返回旅程 ID、bridge 与归一化的获客上下文。重放、错误的 verifier 与未知
   ID 共享同一个 not-found 响应；已认证但未绑定的认领是 pending，已认证但已过期的认领是 gone。

浏览器绝不收到 verifier，service 也绝不存储它。宿主只在成功的 redeem 响应中收到旅程 ID。
没有任何路由启用 CORS。认领响应是 `no-store`；浏览器路由被排除在所有浏览器分析（analytics）
与搜索索引之外。

## 数据与投递

归一化的触点形状包含有界的 UTM `source`、`medium`、`campaign`、`content`、一个封闭的 referrer
类别、epoch 毫秒时间戳，以及策略版本 `1`。它不把落地页转移到应用。PostHog 通过把携带
`journey_id` 与 `content_key`/`$pathname` 的网站事件与 `acquisition_linked.journey_id` 连接起来，
派生落地页/末页分析。产品 server 维护这份 schema 的严格镜像，而不导入网站代码；两份副本一起
变更。浏览器存储按旅程保存首次/末次触点以及最新的桌面下载 bridge；新旅程会重置两者。带 UTM
标签或来自外部的搜索/社交/推荐触点会推进末次触点并使先前的 bridge 失效；无标签的内部/直接
导航会保留两者，而后续经同意的下载会替换 bridge。无 bridge 的事件依然有效。已知的 Marketing
拒绝或撤回会清除已存储的上下文；未知的同意状态会保留它，但认领路由只在当前 Cookiebot cookie
记录 Marketing 授权或 `-1` 时才读取它。正常页面读取要求当前旅程；隔离的认领路由只接受在其
末次触点之后 30 天内的、通过校验的上下文。不存储 `utm_term`、完整 URL、原始广告点击 ID、
账户数据、IP 或 user agent。认领记录在十分钟后过期，并在兑换时或 create 期间的清理中被删除。

D1 条件更新是 bind 与 redeem 的线性化点。一张只以 UTC 分钟桶为键的配额表原子地允许每个
桶最多 1,000 次 create，且不携带任何客户端标识符；更早的桶会被机会性地删除。Create 先消耗
配额，再删除所有已过期的认领行，然后用一次条件插入强制 50,000 行的全局活跃上限；容量不足时
返回 503 且不插入。不同的认领可以绑定并兑换同一个 bridge ID，而认领 ID 加 verifier challenge
与原子删除保住了认领的一次性兑换。应用代码绝不记录认领 ID、challenge、campaign 值或请求体。
部署仍是一个 Cloudflare Pages 项目：固定版本的 Wrangler `4.124.0` 校验配置并构建静态产物与
`functions/`；其预览环境用 `[]` 覆盖 `d1_databases`，而只有生产绑定 `ATTRIBUTION_DB` 并应用
已提交的 D1 迁移。
