// Cookie: acw_sc__v2
function reorganizeAndEncrypt(arg1) {
	// 定义位置映射数组 mask（base64 解码后得到的字符串）
	const mask = Buffer.from('MzAwMDE3NjAwMDg1NjAwNjA2MTUwMTUzMzAwMzY5MDAyNzgwMDM3NQ==', 'base64').toString();

	// 页面源码中 posList 的值，从16进制转换为10进制
	const posList = [
		15, 35, 29, 24, 33, 16, 1, 38, 10, 9, 19, 31, 40, 27, 22, 23, 25, 13, 6, 11, 39, 18, 20, 8, 14, 21, 32, 26, 2, 30, 7, 4, 17, 5, 3, 28,
		34, 37, 12, 36,
	];

	// 构建位置到索引的映射
	const map = {};
	posList.forEach((pos, idx) => {
		map[pos] = idx;
	});

	// 初始化输出数组
	const output = new Array(posList.length).fill('');

	// 遍历输入字符，重新排序
	for (let i = 1; i <= arg1.length; i++) {
		// 索引从1开始
		if (map[i] !== undefined && map[i] < posList.length) {
			output[map[i]] = arg1[i - 1];
		}
	}

	// 生成重排后的字符串
	const rearranged = output.join('');

	// 异或加密
	let result = '';
	let i = 0;
	const dataLength = rearranged.length;
	const maskLength = mask.length;

	while (i < dataLength && i < maskLength) {
		const dataChunkText = rearranged.substr(i, 2);
		const maskChunkText = mask.substr(i, 2);

		if (dataChunkText && maskChunkText) {
			const dataChunk = parseInt(dataChunkText, 16);
			const maskChunk = parseInt(maskChunkText, 16);
			const xorResult = dataChunk ^ maskChunk;

			// 转换为十六进制，确保两位长度
			let hexResult = xorResult.toString(16);
			if (hexResult.length < 2) hexResult = '0' + hexResult;

			result += hexResult;
			i += 2;
		}
	}

	return result.toLowerCase();
}

// --- 使用示例 ---
const arg1 = 'E2A5C3D1D81F65534D08570BE9086E2F329ADF2D';
console.log(reorganizeAndEncrypt(arg1));
