const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const upload = multer({
    dest: os.tmpdir(),
    limits: {
        fileSize: 100 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        if (
            file.mimetype === 'application/pdf' ||
            file.originalname.toLowerCase().endsWith('.pdf')
        ) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'));
        }
    }
});

function cleanup(...files) {
    for (const file of files) {
        if (file && fs.existsSync(file)) {
            try {
                fs.unlinkSync(file);
            } catch {}
        }
    }
}

/*
    MuPDF compression profiles

    low:
        Quality priority
        ~200 DPI
        JPEG quality 82

    medium:
        Balanced
        ~150 DPI
        JPEG quality 75

    high:
        Size priority
        ~100 DPI
        JPEG quality 65
*/

const PROFILES = {
    low: {
        dpi: 200,
        jpegQuality: 82
    },

    medium: {
        dpi: 150,
        jpegQuality: 75
    },

    high: {
        dpi: 100,
        jpegQuality: 65
    }
};

function compressWithMuPDF(
    inputPath,
    outputPath,
    quality
) {
    return new Promise((resolve, reject) => {
        const profile =
            PROFILES[quality] ||
            PROFILES.medium;

        const args = [
            'clean',

            '-gg',
            '-z',
            '-f',
            '-Z',

            `--color-lossy-image-subsample-method=bicubic`,
            `--color-lossy-image-subsample-dpi=${profile.dpi},${profile.dpi}`,
            `--color-lossy-image-recompress-method=jpeg:${profile.jpegQuality}`,

            `--gray-lossy-image-subsample-method=bicubic`,
            `--gray-lossy-image-subsample-dpi=${profile.dpi},${profile.dpi}`,
            `--gray-lossy-image-recompress-method=jpeg:${profile.jpegQuality}`,

            `--bitonal-lossless-image-subsample-method=average`,
            `--bitonal-lossless-image-subsample-dpi=${profile.dpi},${profile.dpi}`,
            `--bitonal-lossless-image-recompress-method=fax`,

            '--recompress-images-when=smaller',

            inputPath,
            outputPath
        ];

        console.log(
            `[MuPDF] Profile: ${quality}`
        );

        console.log(
            `[MuPDF] DPI: ${profile.dpi}`
        );

        console.log(
            `[MuPDF] JPEG quality: ${profile.jpegQuality}`
        );

        console.log(
            `[MuPDF] Command: mutool ${args.join(' ')}`
        );

        const start = Date.now();

        execFile(
            'mutool',
            args,
            {
                timeout: 180000,
                maxBuffer: 10 * 1024 * 1024
            },
            (err, stdout, stderr) => {
                const elapsed =
                    Date.now() - start;

                if (err) {
                    console.error(
                        '[MuPDF stderr]',
                        stderr
                    );

                    reject(
                        new Error(
                            `MuPDF error: ${
                                stderr ||
                                err.message
                            }`
                        )
                    );

                    return;
                }

                resolve(elapsed);
            }
        );
    });
}

app.get('/', (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            'pdf-compressor.html'
        )
    );
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'MuPDF PDF Compressor Test'
    });
});

app.post(
    '/compress',
    upload.single('file'),
    async (req, res) => {
        const inputPath =
            req.file?.path;

        let outputPath = null;

        const requestStart =
            Date.now();

        try {
            if (!req.file) {
                return res.status(400).json({
                    error:
                        'No PDF file uploaded'
                });
            }

            const originalSize =
                req.file.size;

            const originalName =
                req.file.originalname.replace(
                    /\.pdf$/i,
                    ''
                );

            const quality =
                ['low', 'medium', 'high']
                    .includes(req.body.quality)
                    ? req.body.quality
                    : 'medium';

            outputPath = path.join(
                os.tmpdir(),
                `${uuidv4()}_compressed.pdf`
            );

            const compressionTime =
                await compressWithMuPDF(
                    inputPath,
                    outputPath,
                    quality
                );

            if (!fs.existsSync(outputPath)) {
                throw new Error(
                    'MuPDF did not produce an output file'
                );
            }

            const compressedSize =
                fs.statSync(outputPath).size;

            /*
                If MuPDF somehow makes the file larger,
                return the original file.
            */

            const fileToSend =
                compressedSize >= originalSize
                    ? inputPath
                    : outputPath;

            const finalSize =
                compressedSize >= originalSize
                    ? originalSize
                    : compressedSize;

            const savedBytes =
                originalSize -
                finalSize;

            const savedPercent =
                (
                    (savedBytes /
                        originalSize) *
                    100
                ).toFixed(1);

            const totalProcessingTime =
                Date.now() -
                requestStart;

            console.log(
                '================================'
            );

            console.log(
                'MuPDF COMPRESSION RESULT'
            );

            console.log(
                `Profile:   ${quality}`
            );

            console.log(
                `Original:  ${formatBytes(
                    originalSize
                )}`
            );

            console.log(
                `MuPDF:     ${formatBytes(
                    compressedSize
                )}`
            );

            console.log(
                `Final:     ${formatBytes(
                    finalSize
                )}`
            );

            console.log(
                `Saved:     ${savedPercent}%`
            );

            console.log(
                `MuPDF:     ${compressionTime} ms`
            );

            console.log(
                `Total:     ${totalProcessingTime} ms`
            );

            console.log(
                '================================'
            );

            res.setHeader(
                'Content-Type',
                'application/pdf'
            );

            res.setHeader(
                'Content-Disposition',
                `attachment; filename="${originalName}_compressed.pdf"`
            );

            res.setHeader(
                'X-Original-Size',
                originalSize
            );

            res.setHeader(
                'X-Compressed-Size',
                finalSize
            );

            res.setHeader(
                'X-Saved-Bytes',
                savedBytes
            );

            res.setHeader(
                'X-Saved-Percent',
                savedPercent
            );

            res.setHeader(
                'X-Compression-Time',
                compressionTime
            );

            res.setHeader(
                'X-Total-Processing-Time',
                totalProcessingTime
            );

            res.setHeader(
                'X-Compression-Profile',
                quality
            );

            res.setHeader(
                'Access-Control-Expose-Headers',
                [
                    'X-Original-Size',
                    'X-Compressed-Size',
                    'X-Saved-Bytes',
                    'X-Saved-Percent',
                    'X-Compression-Time',
                    'X-Total-Processing-Time',
                    'X-Compression-Profile'
                ].join(', ')
            );

            const stream =
                fs.createReadStream(
                    fileToSend
                );

            stream.pipe(res);

            stream.on('end', () => {
                cleanup(
                    inputPath,
                    outputPath
                );
            });

            stream.on('error', () => {
                cleanup(
                    inputPath,
                    outputPath
                );
            });

        } catch (err) {
            cleanup(
                inputPath,
                outputPath
            );

            console.error(
                '[compress]',
                err.message
            );

            if (!res.headersSent) {
                res.status(500).json({
                    error:
                        err.message ||
                        'Compression failed'
                });
            }
        }
    }
);

app.use(
    (err, req, res, next) => {
        if (
            err.code ===
            'LIMIT_FILE_SIZE'
        ) {
            return res.status(400).json({
                error:
                    'File too large. Maximum size is 100MB.'
            });
        }

        if (
            err.message ===
            'Only PDF files are allowed'
        ) {
            return res.status(400).json({
                error: err.message
            });
        }

        console.error(err);

        if (!res.headersSent) {
            res.status(500).json({
                error:
                    err.message ||
                    'Server error'
            });
        }
    }
);

function formatBytes(bytes) {
    if (bytes === 0) {
        return '0 B';
    }

    const units = [
        'B',
        'KB',
        'MB',
        'GB'
    ];

    const index =
        Math.floor(
            Math.log(bytes) /
            Math.log(1024)
        );

    return `${(
        bytes /
        Math.pow(
            1024,
            index
        )
    ).toFixed(2)} ${
        units[index]
    }`;
}

app.listen(
    PORT,
    '0.0.0.0',
    () => {
        console.log(
            `🚀 MuPDF Compressor running on port ${PORT}`
        );
    }
);