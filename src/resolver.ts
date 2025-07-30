import * as cheerio from 'cheerio';

const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';
const accept =
	'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';
const acceptLanguage = 'zh-CN,zh;q=0.9';

// 工具函数部分
function isEmpty(val: string) {
	return (
		val === '' ||
		val === null ||
		val === undefined ||
		(typeof val === 'object' && Object.keys(val).length === 0) ||
		(Array.isArray(val) && val.length === 0)
	);
}

// 从 ajaxm.php 响应的 URL 中提取更多文件信息
async function getMoreInfoFromAjaxmPHPResponseURL(ajaxmPHPResponseURL: string, getLength: boolean = true) {
	let redirectedURL;
	const resp = await fetch(ajaxmPHPResponseURL, {
		headers: {
			'user-agent': userAgent,
			accept,
			'accept-encoding': 'gzip',
			'accept-language': acceptLanguage,
			connection: 'keep-alive',
		},
		method: 'HEAD',
		redirect: 'manual',
	});

	if (resp.headers.has('location')) {
		redirectedURL = new URL(resp.headers.get('location')!);
		redirectedURL.searchParams.delete('pid');
		if (getLength) {
			const fileResp = await fetch(redirectedURL, {
				method: 'HEAD',
				headers: {
					'user-agent': userAgent,
					'accept-encoding': 'gzip',
					connection: 'keep-alive',
				},
			});

			if (fileResp.headers.has('content-length')) {
				const disposition: string = fileResp.headers.get('content-disposition')!;
				let filename = decodeURIComponent(disposition.match(/filename\*?=(?:UTF-8'')?["']?(.*)["']?/)![1]);
				filename = filename.trim();
				return {
					length: Number(fileResp.headers.get('content-length')),
					redirectedURL,
					filename,
				};
			} else {
				throw new Error("Response missing 'Content-Length' header.");
			}
		} else {
			return { redirectedURL };
		}
	} else {
		throw new Error("'ajaxm.php' response was not redirected.");
	}
}

// 创建用于 ajaxm.php 的请求体
function createAjaxmPHPBody(body: any) {
	return new URLSearchParams(body).toString();
}

// 核心类 LinkResolver：处理蓝奏云链接解析
export class LinkResolver {
	options: JSON_any;
	document: cheerio.CheerioAPI | null = null;
	constructor(options: JSON_any) {
		if (typeof options.url === 'string') {
			options.url = new URL(options.url);
		}
		this.options = Object.freeze(options);
	}

	async resolve() {
		const pageURL = new URL(this.options.url.pathname, 'https://www.lanzoup.com');
		const result: JSON_any = {
			downURL: null,
			filename: '',
			filesize: 0,
		};

		const html = await (
			await fetch(pageURL, {
				headers: {
					accept,
					'accept-language': acceptLanguage,
					'accept-encoding': 'gzip, deflate',
					'user-agent': userAgent,
					connection: 'keep-alive',
				},
				method: 'GET',
			})
		).text();

		this.document = cheerio.load(html);

		// 页面关闭处理
		const pageOffElement = this.document('.off');
		if (pageOffElement.length) {
			const msg = pageOffElement.text();
			throw new Error(msg && msg.includes('文件取消分享') ? 'File unshared.' : 'Unknown page closure reason.');
		}

		const hasPassword = Boolean(this.document('#pwd').length);
		if (hasPassword) {
			if (!this.options.password) {
				throw new Error('Password required.');
			}

			let scriptContent = this.document('script').text();
			scriptContent = scriptContent
				.replace(/\/\/.*(?=[\n\r])/g, '') // 去除单行注释
				.replace(/\/\*[\s\S]*?\*\//g, ''); // 去除多行注释

			const resp = (await (
				await fetch(`https://www.lanzoup.com/ajaxm.php${scriptContent.match(/'*ajaxm.php(.*?)'/)![1]}`, {
					headers: {
						'content-type': 'application/x-www-form-urlencoded',
						referer: pageURL.toString(),
						origin: pageURL.origin,
						'x-requested-with': 'XMLHttpRequest',
						connection: 'keep-alive',
					},
					body: createAjaxmPHPBody({
						action: 'downprocess',
						sign: scriptContent.match(/'sign':'(.*?)'/)![1],
						p: this.options.password,
						kd: scriptContent.match(/var kdns =(.*?);/)![1] ?? '0',
					}),
					method: 'POST',
				})
			).json()) as JSON_any;

			if (resp.zt) {
				result.downURL = new URL('/file/' + resp.url, resp.dom);
				result.filename = resp.inf;

				const moreInfo = await getMoreInfoFromAjaxmPHPResponseURL(result.downURL, this.options.getLength);
				result.filesize = moreInfo.length;
				result.downURL = moreInfo.redirectedURL;
			} else {
				throw new Error(resp.inf === '密码不正确' ? 'Password incorrect.' : 'Unknown ajaxm.php response.');
			}
		} else {
			if (!isEmpty(this.options.password)) {
				console.warn('Password not needs');
			}

			const iframeSrc = this.document('.ifr2').prop('src')!;
			const iframeURL = new URL(iframeSrc, pageURL.origin);
			const iframeHTML = await (
				await fetch(iframeURL, {
					headers: {
						accept,
						'accept-language': acceptLanguage,
						'accept-encoding': 'gzip, deflate',
						'user-agent': userAgent,
						connection: 'keep-alive',
					},
					method: 'GET',
				})
			).text();
			const iframeDocument = cheerio.load(iframeHTML);
			let scriptContent = iframeDocument('script').text();
			scriptContent = scriptContent
				.replace(/\/\/.*(?=[\n\r])/g, '') // 去除单行注释
				.replace(/\/\*[\s\S]*?\*\//g, ''); // 去除多行注释

			const resp = (await (
				await fetch(`https://www.lanzoup.com/ajaxm.php${scriptContent.match(/'*ajaxm.php(.*?)'/)![1]}`, {
					headers: {
						'content-type': 'application/x-www-form-urlencoded',
						referer: iframeURL.toString(),
						origin: iframeURL.origin,
						'x-requested-with': 'XMLHttpRequest',
						connection: 'keep-alive',
					},
					body: createAjaxmPHPBody({
						action: 'downprocess',
						signs: scriptContent.match(/ajaxdata = '(.*?)'/)![1],
						sign: scriptContent.match(/wp_sign = '(.*?)'/)![1],
						websign: scriptContent.match(/ciucjdsdc = '(.*?)'/)![1],
						websignkey: scriptContent.match(/ajaxdata = '(.*?)'/)![1],
						ves: scriptContent.match(/'ves':(.*?)(\s}|,)/)![1],
						kd: scriptContent.match(/var kdns =(.*?);/)![1] ?? '0',
					}),
					method: 'POST',
				})
			).json()) as JSON_any;

			if (resp.zt) {
				result.downURL = new URL('/file/' + resp.url, resp.dom);

				const moreInfo = await getMoreInfoFromAjaxmPHPResponseURL(result.downURL, this.options.getLength);
				result.filesize = moreInfo.length;
				result.filename = moreInfo.filename;
				result.downURL = moreInfo.redirectedURL;
			} else {
				throw new Error('Unknown ajaxm.php response.');
			}
		}

		return result;
	}
}
