async function moveLoop() {
    let delay = 50;
    try {
        let tar = get_nearest_monster_v2({ type: home });
        const eventMaps = ["desertland"];
        if (eventMaps.includes(character.map)) {
            if (tar) {
                // Get the monster's current position and velocity
                let targetX = tar.real_x;
                let targetY = tar.real_y;

                // Check if the monster is moving
                let directionX = 0;
                let directionY = 0;

                if (tar.vx !== 0 || tar.vy !== 0) {
                    // Calculate the direction vector based on the monster's current velocity
                    directionX = tar.going_x - targetX;
                    directionY = tar.going_y - targetY;

                    // Normalize the direction vector
                    let magnitude = Math.sqrt(directionX ** 2 + directionY ** 2);
                    if (magnitude > 0) {
                        directionX /= magnitude;
                        directionY /= magnitude;
                    }

                    // Update last known position
                    lastTarPosition = { x: targetX, y: targetY };
                } else if (lastTarPosition) {
                    // If the monster is not moving, use the last known position
                    targetX = lastTarPosition.x;
                    targetY = lastTarPosition.y;

                    // Use a dummy direction based on the last position to avoid standing on it
                    directionX = tar.going_x - targetX;
                    directionY = tar.going_y - targetY;

                    // Normalize the direction vector
                    let magnitude = Math.sqrt(directionX ** 2 + directionY ** 2);
                    if (magnitude > 0) {
                        directionX /= magnitude;
                        directionY /= magnitude;
                    }
                }

                // Calculate the position 40 units behind the monster
                const behindX = targetX - directionX * 50;
                const behindY = targetY - directionY * 50;

                // Move to the calculated position
                if (can_move_to(behindX, behindY)) {
                    smart.moving = false;
                    smart.searching = false;
                    await move(behindX, behindY);
                } else {
                    if (!smart.moving) {
                        smart_move({
                            x: behindX,
                            y: behindY
                        });
                    }
                }
            }
        }
    } catch (e) {
        console.error(e);
    }
    setTimeout(moveLoop, delay);
}
