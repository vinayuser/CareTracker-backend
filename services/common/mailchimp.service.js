const getConfig = () => {
  const apiKey = String(process.env.MAILCHIMP_API_KEY || '').trim();
  const server = String(process.env.MAILCHIMP_SERVER || apiKey.split('-').pop() || '').trim();
  if (!apiKey || !server) {
    const error = new Error('Mailchimp is not configured');
    error.statusCode = 503;
    throw error;
  }
  return { apiKey, server };
};

const request = async (path, options = {}) => {
  const { apiKey, server } = getConfig();
  const response = await fetch(`https://${server}.api.mailchimp.com/3.0${path}`, {
    ...options,
    headers: {
      Authorization: `Basic ${Buffer.from(`caretracker:${apiKey}`).toString('base64')}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.detail || body.title || 'Mailchimp request failed');
    error.statusCode = response.status;
    throw error;
  }
  return body;
};

const getStatus = async () => {
  const { server } = getConfig();
  const ping = await request('/ping');
  return {
    connected: true,
    server,
    health: ping.health_status || 'Connected',
  };
};

const getLists = async () => {
  const data = await request('/lists?count=50&fields=lists.id,lists.name,lists.stats.member_count');
  return (data.lists || []).map((list) => ({
    id: list.id,
    name: list.name,
    members: list.stats?.member_count || 0,
  }));
};

const subscriberHash = (email) => require('crypto').createHash('md5').update(String(email).trim().toLowerCase()).digest('hex');

const ensureList = async ({ fromName, replyTo }) => {
  if (process.env.MAILCHIMP_LIST_ID) return process.env.MAILCHIMP_LIST_ID;
  const lists = await getLists();
  if (lists[0]?.id) return lists[0].id;
  const created = await request('/lists', {
    method: 'POST',
    body: JSON.stringify({
      name: 'CareTracker',
      permission_reminder: 'You are receiving this email because you agreed to CareTracker updates.',
      email_type_option: false,
      contact: {
        company: 'CareTracker',
        address1: 'Online',
        city: 'New York',
        state: 'NY',
        zip: '10001',
        country: 'US',
      },
      campaign_defaults: {
        from_name: fromName || 'CareTracker',
        from_email: replyTo,
        subject: '',
        language: 'en',
      },
    }),
  });
  return created.id;
};

const sendCampaign = async ({ subject, html, fromName, replyTo, recipients }) => {
  const listId = await ensureList({ fromName, replyTo });
  const when = new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const activity = [];
  const ready = [];

  for (const person of recipients) {
    const email = String(person.email || '').trim();
    const name = String(person.name || email).trim();
    if (!email) continue;
    const [firstName, ...rest] = name.split(' ');
    try {
      await request(`/lists/${listId}/members/${subscriberHash(email)}`, {
        method: 'PUT',
        body: JSON.stringify({
          email_address: email,
          status_if_new: 'subscribed',
          merge_fields: {
            FNAME: firstName || '',
            LNAME: rest.join(' '),
          },
        }),
      });
      ready.push(email);
      activity.push({ name, email, status: 'Delivered', at: when });
    } catch (error) {
      activity.push({ name, email, status: 'Failed', at: when, error: error.message });
    }
  }

  if (!ready.length) {
    const reason = activity.find((row) => row.error)?.error || 'Mailchimp rejected every recipient';
    throw new Error(reason);
  }

  const segment = await request(`/lists/${listId}/segments`, {
    method: 'POST',
    body: JSON.stringify({
      name: `CareTracker ${Date.now()}`,
      static_segment: ready,
    }),
  });

  const campaign = await request('/campaigns', {
    method: 'POST',
    body: JSON.stringify({
      type: 'regular',
      recipients: {
        list_id: listId,
        segment_opts: { saved_segment_id: segment.id },
      },
      settings: {
        subject_line: subject,
        title: subject.slice(0, 90),
        from_name: fromName || 'CareTracker',
        reply_to: replyTo,
      },
    }),
  });

  await request(`/campaigns/${campaign.id}/content`, {
    method: 'PUT',
    body: JSON.stringify({ html }),
  });

  await request(`/campaigns/${campaign.id}/actions/send`, { method: 'POST' });

  return {
    sent: ready.length,
    failed: activity.filter((row) => row.status === 'Failed').length,
    tracked: true,
    provider: 'mailchimp',
    campaignId: campaign.id,
    activity,
  };
};

module.exports = {
  getStatus,
  getLists,
  sendCampaign,
};
