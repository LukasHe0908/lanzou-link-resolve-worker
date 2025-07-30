import { LinkResolver } from './resolver';

export default {
	async fetch(request): Promise<Response> {
		const url = new URL(request.url);
		if(url.pathname==='/'){

		}
		const lanzouLink = url.searchParams.get('url');
		const password = url.searchParams.get('pwd');
		const getMore = url.searchParams.get('more') === '' || url.searchParams.get('more') === 'true';
		const downloadDirect = url.searchParams.get('direct') === '' || url.searchParams.get('direct') === 'true';
		const debug = url.searchParams.get('debug') === '' || url.searchParams.get('debug') === 'true';

		if (!lanzouLink) {
			return new Response(JSON.stringify({ error: "参数 'url' 是必需的！" }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		try {
			const resolver = new LinkResolver({
				url: lanzouLink,
				password: password || undefined,
				getLength: getMore,
			});

			const result = (await resolver.resolve()) as any;

			const responseData: { [key: string]: any } = {
				downloadUrl: result.downURL.href,
				filename: result.filename,
				filesize: result.filesize,
			};

			if (debug) {
				responseData.debugInfo = { originalResult: result, requestUrl: lanzouLink };
			}

			if (downloadDirect) {
				return new Response('', {
					status: 302,
					headers: {
						Location: responseData.downloadUrl,
					},
				});
			}

			return new Response(JSON.stringify(responseData), {
				headers: { 'Content-Type': 'application/json' },
			});
		} catch (error: any) {
			return new Response(
				JSON.stringify({
					error: '解析链接时发生错误。',
					details: error.message,
				}),
				{ status: 500, headers: { 'Content-Type': 'application/json' } }
			);
		}
	},
} satisfies ExportedHandler<Env>;
