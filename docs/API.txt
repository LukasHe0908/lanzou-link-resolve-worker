## 🧾 请求参数(JSON)

| 参数名    | 类型      | 是否必填 | 说明                                                                         |
| --------- | --------- | -------- | ---------------------------------------------------------------------------- |
| `url`     | `string`  | ✅ 必填  | 蓝奏云分享链接，例如 `https://www.lanzoui.com/xxx`                           |
| `pwd`     | `string`  | ❌ 可选  | 提取码（如果需要）                                                           |
| `desolve` | `boolean` | ❌ 可选  | 是否不解析获取到的下载地址。值为 `true`、`""` 时生效。（默认为 false）       |
| `more`    | `boolean` | ❌ 可选  | 是否获取更多信息，如文件大小。值为 `true`、`""` 时生效。（默认为 false）     |
| `direct`  | `boolean` | ❌ 可选  | 是否直接跳转下载地址。值为 `true`、`""` 时生效。（默认为 false）             |
| `debug`   | `boolean` | ❌ 可选  | 是否返回调试信息（解析原始结果）。值为 `true`、`""` 时生效。（默认为 false） |

---

## 📤 返回格式(JSON)

### ✅ 成功

```json
{
	"downloadUrl": "https://...",
	"filename": "example.zip",
	"filesize": 0
}
```

### ✅ 成功 (debug=true)

```json
{
	"downloadUrl": "https://...",
	"filename": "example.zip",
	"filesize": 0,
	"debugInfo": {
		"originalResult": {
			"downURL": "https://...",
			"filename": "example.zip",
			"filesize": 0
		},
		"requestUrl": "https://www.lanzoui.com/xxx"
	}
}
```

### ❌ 错误响应

#### 缺少参数

```json
{
	"error": "参数 'url' 是必需的！"
}
```

#### 解析失败

```json
{
	"error": "解析链接时发生错误。",
	"details": "File unshared."
}
```

---

## 💡 示例

### 获取下载链接

```http
GET /?url=https://www.lanzoui.com/xxx
```

### 获取下载链接（带密码）

```http
GET /?url=https://www.lanzoui.com/xxx&pwd=abcd
```

### 直接跳转到下载链接

```http
GET /?url=https://www.lanzoui.com/xxx&direct
```

### 获取调试信息

```http
GET /?url=https://www.lanzoui.com/xxx&debug
```
