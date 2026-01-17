import * as cheerio from 'cheerio';

interface LinkResolverOptions {
	url: URL;
	password?: string;
	solveURL?: boolean;
	getLength?: boolean;
}

interface ResolveResult {
	downURL: URL;
	filename: string;
	filesize: number;
	warns?: [string?];
}

const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
const accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
const acceptLanguage = 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7';

function isEmpty(val: unknown) {
	return (
		val === '' ||
		val === null ||
		val === undefined ||
		(typeof val === 'object' && Object.keys(val as object).length === 0) ||
		(Array.isArray(val) && val.length === 0)
	);
}

function matchGroup(str: string, regex: RegExp, group = 1): string {
	const match = str.match(regex);
	if (!match || !match[group]) throw new Error(`正则匹配失败：${regex}`);
	return match[group];
}

function createAjaxmPHPBody(body: Record<string, string>) {
	return new URLSearchParams(body).toString();
}

export function getAcwScV2(arg1: string): string {
	// mask：base64 解码后的字符串
	const maskBase64 = 'MzAwMDE3NjAwMDg1NjAwNjA2MTUwMTUzMzAwMzY5MDAyNzgwMDM3NQ==';
	const mask = atob(maskBase64); // CF Worker 环境可以直接用 atob

	// posList：重排位置
	const posList: number[] = [
		15, 35, 29, 24, 33, 16, 1, 38, 10, 9, 19, 31, 40, 27, 22, 23, 25, 13, 6, 11, 39, 18, 20, 8, 14, 21, 32, 26, 2, 30, 7, 4, 17, 5, 3, 28,
		34, 37, 12, 36,
	];

	// 构建位置到索引的映射
	const map: Record<number, number> = {};
	posList.forEach((pos, idx) => (map[pos] = idx));

	// 初始化输出数组
	const output: string[] = new Array(posList.length).fill('');

	// 遍历输入字符，按 posList 重排
	for (let i = 1; i <= arg1.length; i++) {
		const targetIndex = map[i];
		if (targetIndex !== undefined && targetIndex < posList.length) {
			output[targetIndex] = arg1[i - 1];
		}
	}

	const rearranged = output.join('');

	// 异或加密
	let result = '';
	let i = 0;
	while (i < rearranged.length && i < mask.length) {
		const dataChunkText = rearranged.substr(i, 2);
		const maskChunkText = mask.substr(i, 2);

		if (dataChunkText && maskChunkText) {
			const dataChunk = parseInt(dataChunkText, 16);
			const maskChunk = parseInt(maskChunkText, 16);
			const xorResult = dataChunk ^ maskChunk;

			// 转换为十六进制并确保两位
			let hexResult = xorResult.toString(16);
			if (hexResult.length < 2) hexResult = '0' + hexResult;

			result += hexResult;
			i += 2;
		}
	}

	return result.toLowerCase();
}

async function getMoreInfoFromRedirectURL(
	url: string | URL,
	getLength: boolean = false,
	passCookie: string = '',
	warnsForward: [string?] = [],
): Promise<{ redirectedURL: URL; length?: number; filename?: string; warns?: [string?] }> {
	const resp = await fetch(url.toString(), {
		method: 'GET',
		redirect: 'manual',
		headers: {
			'user-agent': userAgent,
			accept,
			'accept-language': acceptLanguage,
			'accept-encoding': 'gzip',
			connection: 'keep-alive',
			cookie: passCookie ?? '',
		},
	});

	const location = resp.headers.get('location');
	if (!location) {
		const warnMsg = '响应头中缺少 location, 需要 Cookie 验证 (getMoreInfoFromRedirectURL)';
		console.warn(warnMsg);

		if (passCookie) {
			throw new Error('无法通过 Cookie 验证 (getMoreInfoFromRedirectURL)');
		}
		const html = await resp.text();
		const encryptArg = html.match(/var arg1='(.+?)';/)![1];
		const cookie = `acw_sc__v2=${getAcwScV2(encryptArg)}`;
		console.log(encryptArg, getAcwScV2(encryptArg));
		return getMoreInfoFromRedirectURL(url, getLength, cookie, [warnMsg]);
	}
	const redirectedURL = new URL(location || '');
	redirectedURL.searchParams.delete('pid');

	if (!getLength) return { redirectedURL, warns: [...warnsForward] };

	const fileResp = await fetch(redirectedURL.toString(), {
		method: 'HEAD',
		headers: {
			'user-agent': userAgent,
			'accept-encoding': 'gzip',
			connection: 'keep-alive',
		},
	});

	const length = fileResp.headers.get('content-length');
	const disposition = fileResp.headers.get('content-disposition');
	if (!length || !disposition) {
		throw new Error('缺少文件大小或文件名信息 (getLength)');
	}

	let filename = decodeURIComponent(matchGroup(disposition, /filename\*?=(?:UTF-8'')?["']?(.*)["']?/)).trim();
	return { redirectedURL, length: Number(length), filename, warns: [...warnsForward] };
}

export class LinkResolver {
	private readonly options: Readonly<LinkResolverOptions>;
	private document: cheerio.CheerioAPI | null = null;

	constructor(options: LinkResolverOptions) {
		this.options = Object.freeze({
			solveURL: true,
			getLength: false,
			...options,
			url: typeof options.url === 'string' ? new URL(options.url) : options.url,
		});
	}

	public async resolve(): Promise<ResolveResult> {
		const pageURL = new URL(this.options.url.pathname, this.options.url.origin);
		let result: ResolveResult = {
			downURL: new URL('https://example.com'),
			filename: '',
			filesize: 0,
			warns: [],
		};

		const html = await (
			await fetch(pageURL.toString(), {
				method: 'GET',
				headers: {
					accept,
					'user-agent': userAgent,
					'accept-language': acceptLanguage,
					'accept-encoding': 'gzip, deflate',
					connection: 'keep-alive',
				},
			})
		).text();

		this.document = cheerio.load(html);

		if (this.document('.off').length) {
			const msg = this.document('.off').text();
			// 文件取消分享
			throw new Error(`${msg} (resolve)`);
		}

		if (this.document('#pwd').length) {
			return this.resolveWithPassword(pageURL, result);
		} else {
			if (!isEmpty(this.options.password)) {
				const warnMsg = '密码未被使用';
				result.warns?.push(warnMsg);
				console.warn(warnMsg);
			}
			return this.resolveWithoutPassword(pageURL, result);
		}
	}

	private async resolveWithPassword(pageURL: URL, result: ResolveResult): Promise<ResolveResult> {
		const scriptContent = this.extractScript(this.document!);
		const body = createAjaxmPHPBody({
			action: 'downprocess',
			sign: matchGroup(scriptContent, /'sign':'(.*?)'/),
			p: this.options.password!,
			kd: matchGroup(scriptContent, /var\s+kdns\s*=\s*(\d+);/, 1) || '0',
		});

		const apiURL = `${this.options.url.origin}/ajaxm.php${matchGroup(scriptContent, /'*ajaxm.php(.*?)'/)}`;
		const resp = (await (
			await fetch(apiURL, {
				method: 'POST',
				headers: {
					'content-type': 'application/x-www-form-urlencoded',
					referer: pageURL.toString(),
					origin: pageURL.origin,
					'x-requested-with': 'XMLHttpRequest',
					connection: 'keep-alive',
				},
				body,
			})
		).json()) as any;

		if (!resp.zt) {
			// 密码不正确
			throw new Error(`${resp.inf} (resolveWithPassword)`);
		}

		const downURL = new URL('/file/' + resp.url, resp.dom);
		let info: any = { redirectedURL: downURL };
		if (this.options.solveURL) info = await getMoreInfoFromRedirectURL(downURL, this.options.getLength);
		let ret = { ...result, downURL: info.redirectedURL, filename: info.filename || resp.inf, filesize: info.length };
		ret.warns?.push(...info.warns);
		return ret;
	}

	private async resolveWithoutPassword(pageURL: URL, result: ResolveResult): Promise<ResolveResult> {
		const iframeSrc = this.document!('.ifr2').prop('src');
		if (!iframeSrc) throw new Error('无法获取 iframe (resolveWithoutPassword)');

		const iframeURL = new URL(iframeSrc, pageURL.origin);
		const iframeHTML = await (
			await fetch(iframeURL.toString(), {
				method: 'GET',
				headers: {
					accept,
					'user-agent': userAgent,
					'accept-language': acceptLanguage,
					'accept-encoding': 'gzip, deflate',
					connection: 'keep-alive',
				},
			})
		).text();

		const iframeDoc = cheerio.load(iframeHTML);
		const scriptContent = this.extractScript(iframeDoc);

		const body = createAjaxmPHPBody({
			action: 'downprocess',
			sign: matchGroup(scriptContent, /wp_sign = '(.*?)'/),
			signs: matchGroup(scriptContent, /ajaxdata = '(.*?)'/),
			websign: matchGroup(scriptContent, /ciucjdsdc = '(.*?)'/),
			websignkey: matchGroup(scriptContent, /ajaxdata = '(.*?)'/),
			ves: matchGroup(scriptContent, /'ves':\s*([^,\n]+)/),
			kd: matchGroup(scriptContent, /var\s+kdns\s*=\s*(\d+);/) || '0',
		});

		const apiURL = `${this.options.url.origin}/ajaxm.php${matchGroup(scriptContent, /'*ajaxm.php(.*?)'/)}`;
		const resp = (await (
			await fetch(apiURL, {
				method: 'POST',
				headers: {
					'content-type': 'application/x-www-form-urlencoded',
					referer: iframeURL.toString(),
					origin: iframeURL.origin,
					'x-requested-with': 'XMLHttpRequest',
					connection: 'keep-alive',
				},
				body,
			})
		).json()) as any;

		if (!resp.zt) {
			throw new Error('ajaxm 响应错误（未带密码） (resolveWithoutPassword)');
		}

		const downURL = new URL('/file/' + resp.url, resp.dom);
		let info: any = { redirectedURL: downURL };
		if (this.options.solveURL) info = await getMoreInfoFromRedirectURL(downURL, this.options.getLength);
		let ret = { ...result, downURL: info.redirectedURL, filename: info.filename, filesize: info.length };
		ret.warns?.push(...info.warns);
		return ret;
	}

	private extractScript(doc: cheerio.CheerioAPI): string {
		return doc('script')
			.text()
			.replace(/\/\/.*(?=[\n\r])/g, '')
			.replace(/\/\*[\s\S]*?\*\//g, '');
	}
}
