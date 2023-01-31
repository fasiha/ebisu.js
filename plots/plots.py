from collections import deque
import numpy as np
import pylab as plt
from scipy.stats import beta as betarv

np.random.seed(123)
plt.style.use('ggplot')
plt.ion()

p = betarv.rvs(4, 4, size=100_000)

fig, ax = plt.subplots()
ax.hist(p, bins=15, alpha=0.5, label='24 hours later')
ax.set_xlabel('Recall probability')
ax.set_ylabel('Frequency')
ax.set_title('Histogram of recall probability model after elapsed time')
ax.legend()
fig.tight_layout()
fig.savefig('hist.png', dpi=300)

fig2, ax2 = plt.subplots()
ax2.set_prop_cycle(color=list(x['color']
                              for x in plt.rcParams['axes.prop_cycle'])[1:])
ax2.hist(p**(.25), bins=15, alpha=0.5, label='6 hours later')
ax2.hist(p**(4), bins=15, alpha=0.5, label='4 days later')
ax2.set_xlabel('Recall probability')
ax2.set_ylabel('Frequency')
ax2.set_title('Histogram of recall probability model after elapsed time')
ax2.legend()
fig.tight_layout()
fig2.savefig('hist2.png', dpi=300)

colors = list(x['color'] for x in plt.rcParams['axes.prop_cycle'])
colors = deque(colors, maxlen=len(colors))

fig, axs = plt.subplots(3, 1)
for ax, a in zip(axs, [1.5, 4, 12]):
    ax.set_prop_cycle(color=colors)
    colors.rotate(-1)
    ax.hist(betarv.rvs(a, a, size=100_000),
            bins=15,
            alpha=0.5,
            label=f'({a=},b={a})')
    ax.set_xlabel('Recall probability')
    ax.set_ylabel('Frequency')
    ax.legend()
fig.suptitle('Histogram of recall probability model after elapsed time')
fig.tight_layout()
fig.savefig('hist3.png', dpi=300)
