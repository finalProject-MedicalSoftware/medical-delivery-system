package id.nevo.monitoring;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.awt.image.DataBufferByte;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Objects;

/**
 * Pure Java Netpbm PGM parser and PNG converter.
 * Supports P5 (binary) and P2 (ASCII) formats commonly produced by ROS 2 map_saver.
 */
public class PgmImageConverter {

    public record PgmData(int width, int height, int maxVal, byte[] grayscaleData) {}

    public static PgmData parse(byte[] bytes) throws IOException {
        if (bytes == null || bytes.length < 3) {
            throw new IllegalArgumentException("File too small to be a valid PGM");
        }
        InputStream in = new ByteArrayInputStream(bytes);
        String magic = readNextToken(in);
        if (!"P5".equals(magic) && !"P2".equals(magic)) {
            throw new IllegalArgumentException("Unsupported PGM format: " + magic + ". Only P5 (binary) and P2 (ascii) are supported.");
        }
        int width = Integer.parseInt(Objects.requireNonNull(readNextToken(in), "Missing PGM width"));
        int height = Integer.parseInt(Objects.requireNonNull(readNextToken(in), "Missing PGM height"));
        int maxVal = Integer.parseInt(Objects.requireNonNull(readNextToken(in), "Missing PGM maxVal"));

        if (width <= 0 || height <= 0 || width > 10000 || height > 10000) {
            throw new IllegalArgumentException("Invalid PGM dimensions: " + width + "x" + height);
        }
        if (maxVal <= 0 || maxVal > 255) {
            throw new IllegalArgumentException("Unsupported PGM maxVal: " + maxVal + " (only <= 255 supported)");
        }

        int totalPixels = width * height;
        byte[] raster = new byte[totalPixels];

        if ("P5".equals(magic)) {
            int read = 0;
            while (read < totalPixels) {
                int count = in.read(raster, read, totalPixels - read);
                if (count == -1) {
                    throw new IOException("Unexpected end of PGM data: expected " + totalPixels + " bytes, read " + read);
                }
                read += count;
            }
        } else {
            for (int i = 0; i < totalPixels; i++) {
                String token = readNextToken(in);
                if (token == null) {
                    throw new IOException("Unexpected end of P2 PGM data at pixel " + i);
                }
                int val = Integer.parseInt(token);
                raster[i] = (byte) (val * 255 / maxVal);
            }
        }

        return new PgmData(width, height, maxVal, raster);
    }

    private static String readNextToken(InputStream in) throws IOException {
        StringBuilder sb = new StringBuilder();
        int b;
        boolean inComment = false;
        while ((b = in.read()) != -1) {
            char c = (char) b;
            if (inComment) {
                if (c == '\n' || c == '\r') {
                    inComment = false;
                }
                continue;
            }
            if (c == '#') {
                inComment = true;
                continue;
            }
            if (Character.isWhitespace(c)) {
                if (!sb.isEmpty()) {
                    return sb.toString();
                }
            } else {
                sb.append(c);
            }
        }
        return sb.isEmpty() ? null : sb.toString();
    }

    public static BufferedImage toBufferedImage(PgmData pgm) {
        BufferedImage image = new BufferedImage(pgm.width(), pgm.height(), BufferedImage.TYPE_BYTE_GRAY);
        byte[] imgData = ((DataBufferByte) image.getRaster().getDataBuffer()).getData();
        System.arraycopy(pgm.grayscaleData(), 0, imgData, 0, pgm.grayscaleData().length);
        return image;
    }

    public static byte[] convertToPng(byte[] pgmBytes) throws IOException {
        PgmData pgm = parse(pgmBytes);
        BufferedImage bufferedImage = toBufferedImage(pgm);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(bufferedImage, "PNG", out);
        return out.toByteArray();
    }
}
