package id.nevo.monitoring;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

public class RosCoordinateTransformTest {

    @Test
    @DisplayName("Round-trip pixel to ROS coordinates with zero yaw")
    void testRoundTripZeroYaw() {
        double resolution = 0.05;
        double originX = -10.0;
        double originY = -15.0;
        double originYaw = 0.0;
        int width = 800;
        int height = 600;

        // Test several pixel locations
        int[][] testPixels = {
                {0, 0},             // top-left
                {799, 599},         // bottom-right
                {0, 599},           // bottom-left (closest to origin)
                {400, 300},         // center
                {123, 456}          // arbitrary
        };

        for (int[] p : testPixels) {
            int px = p[0];
            int py = p[1];

            RosCoordinateTransform.RosPoint ros = RosCoordinateTransform.pixelToRos(px, py, resolution, originX, originY, originYaw, height);
            RosCoordinateTransform.PixelPoint roundTrip = RosCoordinateTransform.rosToPixel(ros.x(), ros.y(), resolution, originX, originY, originYaw, height);

            assertEquals(px, roundTrip.px(), "Pixel X must match round-trip for pixel (" + px + ", " + py + ")");
            assertEquals(py, roundTrip.py(), "Pixel Y must match round-trip for pixel (" + px + ", " + py + ")");
        }
    }

    @Test
    @DisplayName("Round-trip pixel to ROS coordinates with rotated origin (non-zero yaw)")
    void testRoundTripWithRotation() {
        double resolution = 0.05;
        double originX = -5.0;
        double originY = -5.0;
        double originYaw = Math.PI / 4.0; // 45 degrees
        int width = 500;
        int height = 500;

        int[][] testPixels = {
                {250, 250},
                {100, 400},
                {450, 50}
        };

        for (int[] p : testPixels) {
            int px = p[0];
            int py = p[1];

            RosCoordinateTransform.RosPoint ros = RosCoordinateTransform.pixelToRos(px, py, resolution, originX, originY, originYaw, height);
            RosCoordinateTransform.PixelPoint roundTrip = RosCoordinateTransform.rosToPixel(ros.x(), ros.y(), resolution, originX, originY, originYaw, height);

            assertEquals(px, roundTrip.px(), "Rotated pixel X mismatch");
            assertEquals(py, roundTrip.py(), "Rotated pixel Y mismatch");
        }
    }

    @Test
    @DisplayName("Bounds checking: within and outside map dimensions")
    void testBoundsCheck() {
        double resolution = 0.05;
        double originX = -10.0;
        double originY = -10.0;
        double originYaw = 0.0;
        int width = 400; // 20 meters wide -> x from -10 to +10
        int height = 400; // 20 meters tall -> y from -10 to +10

        // Inside bounds
        assertTrue(RosCoordinateTransform.isWithinBounds(0.0, 0.0, resolution, originX, originY, originYaw, width, height));
        assertTrue(RosCoordinateTransform.isWithinBounds(-9.5, -9.5, resolution, originX, originY, originYaw, width, height));
        assertTrue(RosCoordinateTransform.isWithinBounds(9.5, 9.5, resolution, originX, originY, originYaw, width, height));

        // Outside bounds
        assertFalse(RosCoordinateTransform.isWithinBounds(-11.0, 0.0, resolution, originX, originY, originYaw, width, height));
        assertFalse(RosCoordinateTransform.isWithinBounds(11.0, 0.0, resolution, originX, originY, originYaw, width, height));
        assertFalse(RosCoordinateTransform.isWithinBounds(0.0, -11.0, resolution, originX, originY, originYaw, width, height));
        assertFalse(RosCoordinateTransform.isWithinBounds(0.0, 11.0, resolution, originX, originY, originYaw, width, height));
    }
}
