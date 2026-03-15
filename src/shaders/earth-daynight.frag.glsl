uniform sampler2D dayTexture;
uniform sampler2D nightTexture;
uniform sampler2D normalMap;
uniform sampler2D displacementMap;
uniform vec3 sunDir;
uniform vec3 moonPos;
uniform float moonRadius;
uniform float showNight;
uniform float nightEmission;
uniform float hasNormalMap;
uniform float aoEnabled;
uniform float hasDisplacement;

varying vec2 vUv;

const float PI = 3.14159265359;
const float TWO_PI = 6.28318530718;
const float TEX_STEP = 1.0 / 2048.0;
const float AO_STRENGTH = 8.0;
const float EARTH_R = 6371.0;
const float SUN_ANG_R = 0.00465;

void main() {
    vec4 day = texture2D(dayTexture, vUv);

    // Curvature AO from displacement map
    float ao = 1.0;
    if (hasDisplacement > 0.5 && aoEnabled > 0.5) {
        float hC = texture2D(displacementMap, vUv).r;
        float hL = texture2D(displacementMap, vUv + vec2(-TEX_STEP, 0.0)).r;
        float hR = texture2D(displacementMap, vUv + vec2( TEX_STEP, 0.0)).r;
        float hD = texture2D(displacementMap, vUv + vec2(0.0, -TEX_STEP)).r;
        float hU = texture2D(displacementMap, vUv + vec2(0.0,  TEX_STEP)).r;
        float laplacian = (hL + hR + hD + hU) * 0.25 - hC;
        ao = clamp(1.0 - laplacian * AO_STRENGTH, 0.5, 1.0);
    }

    // Reconstruct geometric surface normal from UV (ECEF, needed for eclipse + terminator)
    float theta = (vUv.x - 0.5) * TWO_PI;
    float phi = vUv.y * PI;
    float sinPhi = sin(phi);
    float cosPhi = cos(phi);
    float sinTheta = sin(theta);
    float cosTheta = cos(theta);
    vec3 baseNormal = vec3(cosTheta * sinPhi, cosPhi, -sinTheta * sinPhi);

    // Solar eclipse shadow (Moon blocking Sun)
    float eclipseFactor = 1.0;
    float rawIntensity = dot(baseNormal, sunDir);
    if (rawIntensity > -0.15) {
        vec3 surfPos = baseNormal * EARTH_R;
        vec3 toMoon = moonPos - surfPos;
        float moonDist = length(toMoon);
        float sep = acos(clamp(dot(toMoon / moonDist, sunDir), -1.0, 1.0));
        float moonAngR = atan(moonRadius / moonDist);
        eclipseFactor = smoothstep(abs(moonAngR - SUN_ANG_R), moonAngR + SUN_ANG_R, sep);
    }

    if (showNight < 0.5) {
        gl_FragColor = day * ao * eclipseFactor;
        return;
    }

    vec4 night = texture2D(nightTexture, vUv);

    // Perturb normal with tangent-space normal map (for terminator shading, not eclipse)
    vec3 normal = baseNormal;
    if (hasNormalMap > 0.5) {
        vec3 T = normalize(vec3(-sinTheta * sinPhi, 0.0, -cosTheta * sinPhi));
        vec3 B = normalize(vec3(cosTheta * cosPhi, -sinPhi, -sinTheta * cosPhi));
        vec3 mapN = texture2D(normalMap, vUv).rgb * 2.0 - 1.0;
        normal = normalize(T * mapN.x + B * mapN.y + baseNormal * mapN.z);
    }

    float intensity = dot(normal, sunDir);
    float blend = smoothstep(-0.15, 0.15, intensity);

    // Sunset scattering: 2-stop gradient (deep red near night → warm orange near day)
    float scatterMult = smoothstep(-0.15, 0.25, intensity) * smoothstep(0.25, -0.15, intensity);
    vec3 sunsetDeep = vec3(0.85, 0.2, 0.08);
    vec3 sunsetWarm = vec3(1.0, 0.55, 0.2);
    float gradPos = smoothstep(-0.12, 0.12, intensity);
    vec3 sunsetColor = mix(sunsetDeep, sunsetWarm, gradPos);
    vec3 scatteredDay = mix(day.rgb * ao, day.rgb * ao * sunsetColor * 1.5, scatterMult * 0.15);

    // Surface haze: blue-to-sunset atmospheric haze near terminator
    vec3 hazeColor = mix(vec3(0.15, 0.35, 0.75), sunsetColor, scatterMult);
    float surfaceHaze = pow(max(1.0 - abs(intensity), 0.0), 2.0) * smoothstep(-0.1, 0.2, intensity) * 0.1;
    scatteredDay = mix(scatteredDay, hazeColor, surfaceHaze);

    // Boost night emission for bloom (HDR values > 1.0)
    vec4 boostedNight = vec4(night.rgb * nightEmission, night.a);
    // Eclipse: blend day toward night lights instead of black
    vec4 dayColor = mix(boostedNight, vec4(scatteredDay, day.a), eclipseFactor);
    gl_FragColor = mix(boostedNight, dayColor, blend);
}
