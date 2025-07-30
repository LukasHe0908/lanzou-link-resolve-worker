import * as cheerio from 'cheerio';

interface LinkResolverOptions {
	url: URL;
	password?: string;
	getLength?: boolean;
}

interface ResolveResult {
	downURL: URL;
	filename: string;
	filesize: number;
}

const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';
const accept =
	'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';
const acceptLanguage = 'zh-CN,zh;q=0.9';

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

async function getMoreInfoFromAjaxmPHPResponseURL(
	url: string | URL,
	getLength: boolean = true
): Promise<{ redirectedURL: URL; length?: number; filename?: string }> {
	const resp = await fetch(url.toString(), {
		method: 'HEAD',
		redirect: 'manual',
		headers: {
			'user-agent': userAgent,
			accept,
			'accept-language': acceptLanguage,
			'accept-encoding': 'gzip',
			connection: 'keep-alive',
		},
	});

	const location = resp.headers.get('location');
	if (!location) throw new Error("响应中缺少 'location' 重定向头");

	const redirectedURL = new URL(location);
	redirectedURL.searchParams.delete('pid');

	if (!getLength) return { redirectedURL };

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
		throw new Error('缺少文件大小或文件名信息');
	}

	let filename = decodeURIComponent(matchGroup(disposition, /filename\*?=(?:UTF-8'')?["']?(.*)["']?/)).trim();
	return { redirectedURL, length: Number(length), filename };
}

export class LinkResolver {
	private readonly options: Readonly<LinkResolverOptions>;
	private document: cheerio.CheerioAPI | null = null;

	constructor(options: LinkResolverOptions) {
		this.options = Object.freeze({
			getLength: true,
			...options,
			url: typeof options.url === 'string' ? new URL(options.url) : options.url,
		});
	}

	public async resolve(): Promise<ResolveResult> {
		const pageURL = new URL(this.options.url.pathname, this.options.url.origin);
		const result: ResolveResult = {
			downURL: new URL('https://example.com'),
			filename: '',
			filesize: 0,
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
			throw new Error(msg.includes('文件取消分享') ? 'File unshared.' : 'Page is closed.');
		}

		if (this.document('#pwd').length) {
			return this.resolveWithPassword(pageURL, result);
		} else {
			if (!isEmpty(this.options.password)) {
				console.warn('密码未被使用');
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
			throw new Error(resp.inf === '密码不正确' ? 'Password incorrect.' : 'Unknown passworded page error');
		}

		const downURL = new URL('/file/' + resp.url, resp.dom);
		const info = await getMoreInfoFromAjaxmPHPResponseURL(downURL, this.options.getLength);
		return {
			downURL: info.redirectedURL,
			filename: info.filename || resp.inf,
			filesize: info.length ?? 0,
		};
	}

	private async resolveWithoutPassword(pageURL: URL, result: ResolveResult): Promise<ResolveResult> {
		const iframeSrc = this.document!('.ifr2').prop('src');
		if (!iframeSrc) throw new Error('无法获取 iframe');

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
			throw new Error('ajaxm 响应错误（未带密码）');
		}

		const downURL = new URL('/file/' + resp.url, resp.dom);
		const info = await getMoreInfoFromAjaxmPHPResponseURL(downURL, this.options.getLength);
		return {
			downURL: info.redirectedURL,
			filename: info.filename || 'unknown',
			filesize: info.length ?? 0,
		};
	}

	private extractScript(doc: cheerio.CheerioAPI): string {
		return doc('script')
			.text()
			.replace(/\/\/.*(?=[\n\r])/g, '')
			.replace(/\/\*[\s\S]*?\*\//g, '');
	}
}
