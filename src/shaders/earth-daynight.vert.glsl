uniform sampler2D displacementMap;
uniform float displacementScale;
uniform float hasDisplacement;

varying vec2 vUv;

void main() {
    vUv = uv;

    vec3 pos = position;
    if (hasDisplacement > 0.5) {
        float height = texture2D(displacementMap, uv).r;
        pos += normal * height * displacementScale;
    }

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
