package id.nevo.monitoring;

/**
 * ROS 2 2D Map coordinate transformations (REP-105 standard).
 *
 * Coordinates:
 * - ROS world coordinates (x, y) in meters.
 * - Image pixel coordinates (px, py) with (0,0) at top-left.
 * - In standard ROS occupancy grid:
 *   - The bottom-left pixel corresponds to (originX, originY).
 *   - Py increases downwards, while ROS Y increases upwards.
 *   - Yaw is rotation angle in radians around the origin.
 */
public class RosCoordinateTransform {

    public record RosPoint(double x, double y) {}
    public record PixelPoint(int px, int py) {}

    public static RosPoint pixelToRos(int px, int py, double resolution, double originX, double originY, double originYaw, int height) {
        double gridX = px + 0.5;
        double gridY = (height - 1 - py) + 0.5;
        double dx = gridX * resolution;
        double dy = gridY * resolution;

        if (originYaw == 0.0) {
            return new RosPoint(originX + dx, originY + dy);
        }

        double cos = Math.cos(originYaw);
        double sin = Math.sin(originYaw);
        double rx = originX + (dx * cos - dy * sin);
        double ry = originY + (dx * sin + dy * cos);
        return new RosPoint(rx, ry);
    }

    public static PixelPoint rosToPixel(double rosX, double rosY, double resolution, double originX, double originY, double originYaw, int height) {
        double dx = rosX - originX;
        double dy = rosY - originY;
        double gridX;
        double gridY;

        if (originYaw == 0.0) {
            gridX = dx / resolution;
            gridY = dy / resolution;
        } else {
            double cos = Math.cos(-originYaw);
            double sin = Math.sin(-originYaw);
            double rotatedDx = dx * cos - dy * sin;
            double rotatedDy = dx * sin + dy * cos;
            gridX = rotatedDx / resolution;
            gridY = rotatedDy / resolution;
        }

        int px = (int) Math.floor(gridX);
        int py = (int) Math.floor(height - gridY);
        return new PixelPoint(px, py);
    }

    public static boolean isWithinBounds(double rosX, double rosY, double resolution, double originX, double originY, double originYaw, int width, int height) {
        PixelPoint p = rosToPixel(rosX, rosY, resolution, originX, originY, originYaw, height);
        return p.px() >= 0 && p.px() < width && p.py() >= 0 && p.py() < height;
    }
}
