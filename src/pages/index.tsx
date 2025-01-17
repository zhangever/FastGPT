import React, { useEffect } from 'react';
import { Card, Box, Link } from '@chakra-ui/react';
import Markdown from '@/components/Markdown';
import { useMarkdown } from '@/hooks/useMarkdown';
import { useRouter } from 'next/router';

const Home = () => {
  const { inviterId } = useRouter().query as { inviterId: string };
  const { data } = useMarkdown({ url: '/intro.md' });

  useEffect(() => {
    if (inviterId) {
      localStorage.setItem('inviterId', inviterId);
    }
  }, [inviterId]);

  return (
    <>
      <Card p={5} lineHeight={2}>
        <Markdown source={data} isChatting={false} />
      </Card>

      <Card p={5} mt={4} textAlign={'center'}>
        <Box>
          {/* <Link href="https://beian.miit.gov.cn/" target="_blank">
            浙B2-20080101
          </Link> */}
        </Box>
        <Box>Made by FastGpt Team.</Box>
      </Card>
    </>
  );
};

export default Home;
