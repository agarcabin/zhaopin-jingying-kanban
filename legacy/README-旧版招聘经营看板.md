# 招聘经营看板

招聘经营数据看板的静态页面文件。页面在浏览器中读取同目录下的 `data.json` 并渲染图表和明细。

## 文件

- `index.html`：页面结构
- `styles.css`：样式
- `app.js`：浏览器端交互与数据展示
- `data.json`：看板数据

## 本地预览

在此目录运行：

```powershell
python -m http.server 8000
```

然后打开 <http://localhost:8000>。

数据来源页面：<https://recruiting-operations-y.dusky-dove-9037.chatgpt.site/>