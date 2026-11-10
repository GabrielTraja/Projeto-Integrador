const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');

const imageDirectory = path.resolve(__dirname, '../../uploads');
const maxImageBytes = 5 * 1024 * 1024;
const formats = {
    'image/jpeg': {
        extension: '.jpg',
        matches(buffer) {
            return buffer.length >= 3 &&
                buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
        }
    },
    'image/png': {
        extension: '.png',
        matches(buffer) {
            return buffer.length >= 8 &&
                buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        }
    },
    'image/webp': {
        extension: '.webp',
        matches(buffer) {
            return buffer.length >= 12 &&
                buffer.toString('ascii', 0, 4) === 'RIFF' &&
                buffer.toString('ascii', 8, 12) === 'WEBP';
        }
    }
};

function erroImagem(mensagem, status = 400) {
    return Object.assign(new Error(mensagem), { status });
}

async function salvarImagemProduto(dataUrl) {
    if (typeof dataUrl !== 'string') {
        throw erroImagem('A imagem do produto é inválida.');
    }

    const correspondencia = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!correspondencia) {
        throw erroImagem('Formato inválido. Envie uma imagem JPG, JPEG, PNG ou WEBP.');
    }

    const [, mimeType, conteudoBase64] = correspondencia;
    const buffer = Buffer.from(conteudoBase64, 'base64');
    if (buffer.length === 0 || buffer.length > maxImageBytes) {
        throw erroImagem('A imagem deve ter no máximo 5 MB.');
    }

    if (!formats[mimeType].matches(buffer)) {
        throw erroImagem('O conteúdo do arquivo não corresponde a uma imagem JPG, PNG ou WEBP válida.');
    }

    await fs.mkdir(imageDirectory, { recursive: true });
    const nomeArquivo = `${randomUUID()}${formats[mimeType].extension}`;
    await fs.writeFile(path.join(imageDirectory, nomeArquivo), buffer, { flag: 'wx' });
    return `/uploads/${nomeArquivo}`;
}

async function removerImagemProduto(foto) {
    if (typeof foto !== 'string' || !foto.startsWith('/uploads/')) return;
    const nomeArquivo = foto.slice('/uploads/'.length);
    if (!/^[\da-f-]+\.(?:jpg|png|webp)$/i.test(nomeArquivo)) return;

    try {
        await fs.unlink(path.join(imageDirectory, nomeArquivo));
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
}

module.exports = { salvarImagemProduto, removerImagemProduto };
