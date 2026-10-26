package id.nevo.monitoring;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.*;

public class PgmImageConverterTest {

    @Test
    @DisplayName("Parse and convert binary P5 PGM to PNG")
    void testBinaryP5Conversion() throws IOException {
        int width = 4;
        int height = 3;
        ByteArrayOutputStream pgm = new ByteArrayOutputStream();
        pgm.write("P5\n# ROS 2 map saver test\n4 3\n255\n".getBytes(StandardCharsets.US_ASCII));
        byte[] pixels = new byte[]{
                0, (byte) 254, (byte) 205, 0,
                (byte) 254, (byte) 254, (byte) 254, (byte) 254,
                0, 0, (byte) 205, (byte) 254
        };
        pgm.write(pixels);

        byte[] pgmBytes = pgm.toByteArray();
        var data = PgmImageConverter.parse(pgmBytes);
        assertEquals(4, data.width());
        assertEquals(3, data.height());
        assertEquals(255, data.maxVal());
        assertEquals(12, data.grayscaleData().length);

        byte[] pngBytes = PgmImageConverter.convertToPng(pgmBytes);
        assertNotNull(pngBytes);
        assertTrue(pngBytes.length > 8);
        // Verify PNG magic bytes
        assertEquals((byte) 137, pngBytes[0]);
        assertEquals('P', (char) pngBytes[1]);
        assertEquals('N', (char) pngBytes[2]);
        assertEquals('G', (char) pngBytes[3]);
    }

    @Test
    @DisplayName("Parse and convert ASCII P2 PGM to PNG")
    void testAsciiP2Conversion() throws IOException {
        String p2Content = """
                P2
                # ASCII test
                3 2
                255
                0 255 128
                255 0 64
                """;
        byte[] pgmBytes = p2Content.getBytes(StandardCharsets.US_ASCII);
        var data = PgmImageConverter.parse(pgmBytes);
        assertEquals(3, data.width());
        assertEquals(2, data.height());
        assertEquals(255, data.maxVal());

        byte[] pngBytes = PgmImageConverter.convertToPng(pgmBytes);
        assertNotNull(pngBytes);
        assertEquals((byte) 137, pngBytes[0]);
    }

    @Test
    @DisplayName("Reject invalid PGM magic number")
    void testInvalidPgm() {
        byte[] invalid = "P9\n2 2\n255\n0 0 0 0".getBytes(StandardCharsets.US_ASCII);
        assertThrows(IllegalArgumentException.class, () -> PgmImageConverter.parse(invalid));
    }
}
