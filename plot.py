import numpy as np
import matplotlib.pyplot as plt
import os

d = np.linspace(0, 1, 500)
# Old: Bisquare
w_old = (1 - d**2)**2

# New: Flat-top with cosine taper after 80%
w_new = np.ones_like(d)
taper_start = 0.8
taper_mask = d > taper_start
# phase from 0 to pi
phase = (d[taper_mask] - taper_start) / (1 - taper_start) * np.pi
w_new[taper_mask] = 0.5 * (1 + np.cos(phase))

plt.figure(figsize=(8, 5))
plt.plot(d * 100, w_old, label='Old: Bisquare Kernel', color='blue', linewidth=2)
plt.plot(d * 100, w_new, label='New: Tukey Taper (80% flat, then taper)', color='red', linewidth=2)
plt.title('StDev Weighting Function vs Distance')
plt.xlabel('Distance (% of Max Distance)')
plt.ylabel('Weight (Influence on StDev)')
plt.grid(True, alpha=0.3)
plt.legend()
plt.tight_layout()

out_dir = r"C:\Users\USER\.gemini\antigravity\brain\651406c1-8051-4829-90d2-7e03d2b7e6bb"
os.makedirs(out_dir, exist_ok=True)
plt.savefig(os.path.join(out_dir, "kernel_comparison.png"))
print("Plot saved.")
