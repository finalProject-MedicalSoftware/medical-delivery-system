package id.nevo.monitoring;

import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.awt.image.DataBufferByte;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

public class MapGeneratorTest {

    @Test
    void generateSampleMockMapFiles() throws IOException {
        int width = 400; // 20m x 20m at 0.05m/pixel
        int height = 400;

        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_BYTE_GRAY);
        Graphics2D g = image.createGraphics();

        // 1. Fill background with unknown (value 205 = 0xCD)
        g.setColor(new Color(205, 205, 205));
        g.fillRect(0, 0, width, height);

        // 2. Main hospital boundary (rooms & corridors) - free space (value 254 = white)
        g.setColor(new Color(254, 254, 254));
        g.fillRect(40, 40, 320, 320);

        // 3. Draw outer walls - black (value 0)
        g.setColor(Color.BLACK);
        g.setStroke(new BasicStroke(4));
        g.drawRect(40, 40, 320, 320);

        // 4. Draw central corridor & room dividers
        g.setStroke(new BasicStroke(3));
        // Horizontal main corridor (y: 180 to 220)
        g.drawLine(40, 180, 360, 180);
        g.drawLine(40, 220, 360, 220);

        // Room partitions top row
        g.drawLine(140, 40, 140, 180);
        g.drawLine(250, 40, 250, 180);

        // Room partitions bottom row
        g.drawLine(140, 220, 140, 360);
        g.drawLine(250, 220, 250, 360);

        // 5. Open doors (free space cutouts)
        g.setColor(new Color(254, 254, 254));
        g.fillRect(80, 175, 25, 10);
        g.fillRect(190, 175, 25, 10);
        g.fillRect(300, 175, 25, 10);
        g.fillRect(80, 215, 25, 10);
        g.fillRect(190, 215, 25, 10);
        g.fillRect(300, 215, 25, 10);

        g.dispose();

        // Save samples to samples/ros-mock-map/
        File dir = new File("../samples/ros-mock-map");
        if (!dir.exists()) dir.mkdirs();

        // Save PNG
        File pngFile = new File(dir, "map.png");
        ImageIO.write(image, "PNG", pngFile);

        // Save binary PGM (P5)
        File pgmFile = new File(dir, "map.pgm");
        byte[] rawPixels = ((DataBufferByte) image.getRaster().getDataBuffer()).getData();
        try (FileOutputStream out = new FileOutputStream(pgmFile)) {
            String header = "P5\n# ROS 2 Nav2 Mock Hospital Map (0.05m/pixel)\n" + width + " " + height + "\n255\n";
            out.write(header.getBytes(StandardCharsets.US_ASCII));
            out.write(rawPixels);
        }
    }
}
